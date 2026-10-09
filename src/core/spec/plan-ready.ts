import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApprovalNoticeId, NoticeSeverity, RecordedNotice } from './notices.js';

/** One `plan_ready` record in `<change>/.run/plan.jsonl`. */
export interface PlanReadyRecord {
  readonly type: 'plan_ready';
  readonly timestamp: string;
  readonly data: { readonly hash: string; readonly notices: readonly RecordedNotice[] };
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
  return { type: 'plan_ready', timestamp: record.timestamp, data: { hash: data.hash, notices } };
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
  now: Date = new Date(),
): Promise<void> {
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  const line = JSON.stringify({
    type: 'plan_ready',
    timestamp: now.toISOString(),
    data: { hash, notices },
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
