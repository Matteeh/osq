import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PACKAGE_ROOT } from '../foundation/package-root.js';
import {
  NULL_PLANNING_USAGE,
  type PlanRecord,
  type PlanningUsage,
  type PlanningUsageReader,
  type PlanningUsageReaderOptions,
  getPlanLogPath,
} from './planning-records.js';

export type {
  PlanExitedRecord,
  PlanRecord,
  PlanStartedRecord,
  PlanningSession,
  PlanningSource,
  PlanningUsage,
  PlanningUsageReader,
  PlanningUsageReaderOptions,
} from './planning-records.js';
export {
  NULL_PLANNING_USAGE,
  correlatePlanSessions,
  getPlanLogPath,
  parsePlanRecords,
  planningRecordSource,
  readPlanRecords,
  readPlanningSessions,
} from './planning-records.js';

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
    source: 'owned',
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
    source: 'owned',
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
