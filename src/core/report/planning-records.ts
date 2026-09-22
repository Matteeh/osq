import fs from 'node:fs/promises';
import path from 'node:path';
import { getChangeRunDir } from '../status/layout.js';

// Append-only planning telemetry at `<change>/.run/plan.jsonl` (outside the hash).
const PLAN_LOG_NAME = 'plan.jsonl';

/** Origin of one lifecycle record: osq-owned interactive session or local observation. */
export type PlanningSource = 'owned' | 'observed';

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
  /** Absent on legacy records; absence reads as owned. */
  source?: PlanningSource;
  data: {
    harness: string;
    model: string | null;
    agent?: string;
    osqVersion: string;
    briefHash: string;
  };
}
export interface PlanExitedRecord {
  type: 'plan_exited';
  sessionId: string;
  timestamp: string;
  /** Absent on legacy records; absence reads as owned. */
  source?: PlanningSource;
  data: { exitCode: number | null; wallSeconds: number; usage: PlanningUsage };
}
export type PlanRecord = PlanStartedRecord | PlanExitedRecord;

/** A lifecycle pair correlated by planning-session identifier. */
export interface PlanningSession {
  sessionId: string;
  started: PlanStartedRecord | null;
  exited: PlanExitedRecord | null;
}

/** Source of one record, reading a legacy record without a source as owned. */
export function planningRecordSource(record: PlanRecord): PlanningSource {
  return record.source ?? 'owned';
}

/** `<changeFolder>/.run/plan.jsonl`. */
export function getPlanLogPath(changeFolder: string): string {
  return path.join(getChangeRunDir(changeFolder), PLAN_LOG_NAME);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function finiteNonNegative(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}
function parseSource(value: unknown): PlanningSource | undefined {
  return value === 'owned' || value === 'observed' ? value : undefined;
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
  const source = parseSource(record.source);
  if (record.type === 'plan_started') {
    const agent = text(data.agent);
    return {
      type: 'plan_started',
      sessionId,
      timestamp,
      ...(source ? { source } : {}),
      data: {
        harness: text(data.harness),
        model: textOrNull(data.model),
        ...(agent ? { agent } : {}),
        osqVersion: text(data.osqVersion),
        briefHash: text(data.briefHash),
      },
    };
  }
  if (record.type === 'plan_exited') {
    return {
      type: 'plan_exited',
      sessionId,
      timestamp,
      ...(source ? { source } : {}),
      data: {
        // An observed exit has no process status; null is a valid recorded value.
        exitCode: finiteNumber(data.exitCode),
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
