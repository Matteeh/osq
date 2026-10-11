import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApprovalNoticeId, NoticeSeverity, RecordedNotice } from './notices.js';

/** One traceability link finding kept on a `plan_ready` record's data. */
export interface PlanReadyTraceabilityEntry {
  readonly severity: string;
  readonly file: string;
  readonly message: string;
}

/** The data one `plan_ready` record carries. */
export interface PlanReadyData {
  readonly hash: string;
  readonly notices: readonly RecordedNotice[];
  /** The change's traceability link findings; absent when there were none. */
  readonly traceability?: readonly PlanReadyTraceabilityEntry[];
}

/** One `plan_ready` record in `<change>/.run/plan.jsonl`. */
export interface PlanReadyRecord {
  readonly type: 'plan_ready';
  readonly timestamp: string;
  readonly data: PlanReadyData;
}

const SEVERITIES: readonly NoticeSeverity[] = ['red', 'amber', 'grey'];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseRecordedNotice(value: unknown): RecordedNotice | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.id !== 'string') return null;
  if (
    typeof record.severity !== 'string' ||
    !SEVERITIES.includes(record.severity as NoticeSeverity)
  ) {
    return null;
  }
  if (typeof record.folded !== 'boolean') return null;
  return {
    id: record.id as ApprovalNoticeId,
    severity: record.severity as NoticeSeverity,
    folded: record.folded,
  };
}

/** Parse a record's `traceability` list, leaving out entries without all three strings. */
function parseTraceability(value: unknown): PlanReadyTraceabilityEntry[] {
  const entries: PlanReadyTraceabilityEntry[] = [];
  if (!Array.isArray(value)) return entries;
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    if (typeof record.severity !== 'string') continue;
    if (typeof record.file !== 'string') continue;
    if (typeof record.message !== 'string') continue;
    entries.push({ severity: record.severity, file: record.file, message: record.message });
  }
  return entries;
}

function parsePlanReady(value: unknown): PlanReadyRecord | null {
  const record = asRecord(value);
  const data = asRecord(record?.data);
  if (!record || !data) return null;
  if (record.type !== 'plan_ready') return null;
  if (typeof record.timestamp !== 'string' || record.timestamp === '') return null;
  if (typeof data.hash !== 'string') return null;
  if (!Array.isArray(data.notices)) return null;
  const notices: RecordedNotice[] = [];
  for (const entry of data.notices) {
    const notice = parseRecordedNotice(entry);
    if (!notice) return null;
    notices.push(notice);
  }
  const traceability = Array.isArray(data.traceability)
    ? parseTraceability(data.traceability)
    : undefined;
  return {
    type: 'plan_ready',
    timestamp: record.timestamp,
    data: { hash: data.hash, notices, ...(traceability ? { traceability } : {}) },
  };
}

/** `<changeFolder>/.run/plan.jsonl`. */
export function getPlanReadyPath(folderPath: string): string {
  return path.join(folderPath, '.run', 'plan.jsonl');
}

/**
 * The folder's `plan_ready` records in file order, skipping blank and malformed
 * lines. A missing log reads as no records.
 */
export async function readPlanReady(folderPath: string): Promise<PlanReadyRecord[]> {
  const content = await fs.readFile(getPlanReadyPath(folderPath), 'utf8').catch(() => null);
  if (content === null) return [];
  const records: PlanReadyRecord[] = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const record = parsePlanReady(parsed);
    if (record) records.push(record);
  }
  return records;
}

/** Append one `plan_ready` record to `<folder>/.run/plan.jsonl`, creating `.run/` when needed. */
export async function appendPlanReady(
  folderPath: string,
  hash: string,
  notices: readonly RecordedNotice[],
  traceability: readonly PlanReadyTraceabilityEntry[] = [],
  now: Date = new Date(),
): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  const data = {
    hash,
    notices,
    ...(traceability.length > 0 ? { traceability } : {}),
  };
  const line = JSON.stringify({
    type: 'plan_ready',
    timestamp: now.toISOString(),
    data,
  });
  await fs.appendFile(getPlanReadyPath(folderPath), `${line}\n`, 'utf8');
}

/**
 * The revision count: zero without a record, and otherwise the number of
 * records after the first, plus one when the folder's current hash differs
 * from the last record's hash.
 */
export function countPlanRevisions(
  records: readonly PlanReadyRecord[],
  currentHash: string,
): number {
  if (records.length === 0) return 0;
  const afterFirst = records.length - 1;
  return afterFirst + (records[records.length - 1].data.hash === currentHash ? 0 : 1);
}
