import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getChangeRunDir } from './layout.js';

// Append-only planning telemetry at `<change>/.run/plan.jsonl` (outside the hash).
const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PLAN_LOG_NAME = 'plan.jsonl';

/** Observed-only planning usage. Every field is independently nullable. */
export interface PlanningUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  cost: number | null;
}
/** Value used when no reader exists or a reader cannot supply values. */
export const NULL_PLANNING_USAGE: PlanningUsage = Object.freeze({
  inputTokens: null,
  outputTokens: null,
  cachedTokens: null,
  reasoningTokens: null,
  cost: null,
});
/** Interval and working directory passed to an optional harness usage reader. */
export interface PlanningUsageReaderOptions {
  readonly cwd: string;
  readonly startedAt: string;
  readonly endedAt: string;
}
/** Structural port matching the optional `HarnessAdapter.readInteractiveUsage`. */
export type PlanningUsageReader = (options: PlanningUsageReaderOptions) => Promise<PlanningUsage>;

export interface PlanStartedRecord {
  type: 'plan_started';
  sessionId: string;
  timestamp: string;
  data: { harness: string; model: string; agent?: string; osqVersion: string; briefHash: string };
}
export interface PlanExitedRecord {
  type: 'plan_exited';
  sessionId: string;
  timestamp: string;
  data: { exitCode: number; wallSeconds: number; usage: PlanningUsage };
}
export type PlanRecord = PlanStartedRecord | PlanExitedRecord;

/** A lifecycle pair correlated by planning-session identifier. */
export interface PlanningSession {
  sessionId: string;
  started: PlanStartedRecord | null;
  exited: PlanExitedRecord | null;
}

/** `<changeFolder>/.run/plan.jsonl`. */
export function getPlanLogPath(changeFolder: string): string {
  return path.join(getChangeRunDir(changeFolder), PLAN_LOG_NAME);
}
/** `sha256:<hex>` digest of the exact brief bytes. */
export function hashBriefBytes(bytes: Buffer | string): string {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}
/** Version of the osq build currently executing, or `unknown`. */
export async function resolveOsqPackageVersion(): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8');
    const version = (JSON.parse(raw) as { version?: unknown }).version;
    if (typeof version === 'string' && version.trim()) return version.trim();
  } catch {
    // Missing or malformed package.json.
  }
  return 'unknown';
}
/** Appends one JSONL record, creating `.run/` if necessary. */
export async function appendPlanRecord(changeFolder: string, record: PlanRecord): Promise<void> {
  const logPath = getPlanLogPath(changeFolder);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
}
/** Writes `plan_started` before spawn; returns id and start milliseconds. */
export async function recordPlanStarted(
  changeFolder: string,
  options: { harness: string; model: string; agent?: string; briefPath: string },
): Promise<{ sessionId: string; timestamp: string; startedAtMs: number }> {
  const startedAtMs = Date.now();
  const timestamp = new Date(startedAtMs).toISOString();
  const sessionId = crypto.randomUUID();
  await appendPlanRecord(changeFolder, {
    type: 'plan_started',
    sessionId,
    timestamp,
    data: {
      harness: options.harness,
      model: options.model,
      ...(options.agent ? { agent: options.agent } : {}),
      osqVersion: await resolveOsqPackageVersion(),
      briefHash: hashBriefBytes(await fs.readFile(options.briefPath)),
    },
  });
  return { sessionId, timestamp, startedAtMs };
}
/** Writes `plan_exited` after the process has closed, with observed usage. */
export async function recordPlanExited(
  changeFolder: string,
  options: {
    sessionId: string;
    startedAtMs: number;
    endedAtMs: number;
    exitCode: number;
    usage: PlanningUsage;
  },
): Promise<void> {
  await appendPlanRecord(changeFolder, {
    type: 'plan_exited',
    sessionId: options.sessionId,
    timestamp: new Date(options.endedAtMs).toISOString(),
    data: {
      exitCode: options.exitCode,
      wallSeconds: Math.max(0, (options.endedAtMs - options.startedAtMs) / 1000),
      usage: options.usage,
    },
  });
}
/** Invokes an optional reader; absence or failure yields all-null usage. */
export async function readPlanningUsage(
  reader: PlanningUsageReader | undefined,
  options: PlanningUsageReaderOptions,
): Promise<PlanningUsage> {
  if (!reader) return NULL_PLANNING_USAGE;
  try {
    return await reader(options);
  } catch {
    return NULL_PLANNING_USAGE;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function finiteNonNegative(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}
function parseUsage(value: unknown): PlanningUsage {
  const usage = asRecord(value) ?? {};
  return {
    inputTokens: finiteNonNegative(usage.inputTokens),
    outputTokens: finiteNonNegative(usage.outputTokens),
    cachedTokens: finiteNonNegative(usage.cachedTokens),
    reasoningTokens: finiteNonNegative(usage.reasoningTokens),
    cost: finiteNonNegative(usage.cost),
  };
}
function parsePlanRecord(value: unknown): PlanRecord | null {
  const record = asRecord(value);
  const data = asRecord(record?.data);
  const sessionId = typeof record?.sessionId === 'string' ? record.sessionId : '';
  const timestamp = typeof record?.timestamp === 'string' ? record.timestamp : '';
  if (!record || !data || !sessionId || !timestamp) return null;
  if (record.type === 'plan_started') {
    const agent = text(data.agent);
    return {
      type: 'plan_started',
      sessionId,
      timestamp,
      data: {
        harness: text(data.harness),
        model: text(data.model),
        ...(agent ? { agent } : {}),
        osqVersion: text(data.osqVersion),
        briefHash: text(data.briefHash),
      },
    };
  }
  if (record.type === 'plan_exited') {
    const exitCode = finiteNumber(data.exitCode);
    if (exitCode === null) return null;
    return {
      type: 'plan_exited',
      sessionId,
      timestamp,
      data: {
        exitCode,
        wallSeconds: finiteNonNegative(data.wallSeconds) ?? 0,
        usage: parseUsage(data.usage),
      },
    };
  }
  return null;
}
/** Parses a `plan.jsonl` body, skipping blank and malformed lines. */
export function parsePlanRecords(content: string): PlanRecord[] {
  const records: PlanRecord[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const record = parsePlanRecord(parsed);
    if (record) records.push(record);
  }
  return records;
}
/** Reads `<change>/.run/plan.jsonl`; a missing log yields an empty array. */
export async function readPlanRecords(changeFolder: string): Promise<PlanRecord[]> {
  try {
    return parsePlanRecords(await fs.readFile(getPlanLogPath(changeFolder), 'utf8'));
  } catch {
    return [];
  }
}
/** Correlates records by session id, returning sessions in start order. */
export function correlatePlanSessions(records: readonly PlanRecord[]): PlanningSession[] {
  const drafts = new Map<string, PlanningSession>();
  for (const record of records) {
    const draft = drafts.get(record.sessionId) ?? {
      sessionId: record.sessionId,
      started: null,
      exited: null,
    };
    if (record.type === 'plan_started' && !draft.started) draft.started = record;
    if (record.type === 'plan_exited' && !draft.exited) draft.exited = record;
    drafts.set(record.sessionId, draft);
  }
  return [...drafts.values()].sort((a, b) => {
    const aTime = a.started?.timestamp ?? a.exited?.timestamp ?? '';
    const bTime = b.started?.timestamp ?? b.exited?.timestamp ?? '';
    return aTime.localeCompare(bTime);
  });
}
/** Reads and correlates a change's planning log in one call. */
export async function readPlanningSessions(changeFolder: string): Promise<PlanningSession[]> {
  return correlatePlanSessions(await readPlanRecords(changeFolder));
}
