/** Fills the history query `notices` table from archived and rejected changes. */

import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { OsqConfig } from '../foundation/config.js';
import { type PlanReadyRecord, readPlanReady } from '../spec/plan-ready.js';
import { listChanges } from '../status/change-locations.js';
import { listArchivedChanges } from './archive-record.js';
import { readManifestObject } from './change-reads.js';

/** One archived or rejected change the notices table draws from. */
interface NoticeSubject {
  readonly folder: string;
  readonly folderPath: string;
  readonly rejected: boolean;
  /** The archived record's halt count, null read as zero. */
  readonly halts: number;
}

/** One recorded notice of a manifest's `notices` record. */
interface ManifestNotice {
  readonly id: string;
  readonly severity: string;
}

/** A manifest's `notices` record: its items, and the ids the approver opened. */
interface ManifestNotices {
  readonly items: readonly ManifestNotice[];
  readonly opened: readonly string[] | null;
}

/**
 * The manifest's `notices` record, or null when it has none or is malformed.
 * A record is present only when `items` is an array; a missing `opened` reads
 * as null, and a malformed item is left out.
 */
function parseManifestNotices(value: unknown): ManifestNotices | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) return null;
  const items: ManifestNotice[] = [];
  for (const entry of record.items) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.severity !== 'string') continue;
    items.push({ id: item.id, severity: item.severity });
  }
  const opened = Array.isArray(record.opened)
    ? record.opened.filter((entry): entry is string => typeof entry === 'string')
    : null;
  return { items, opened };
}

/** One `plan_ready` record's notices, with a null `opened` and the given outcome. */
function insertPlanNotices(
  stmt: StatementSync,
  subject: NoticeSubject,
  record: PlanReadyRecord,
  outcome: 'planned_again' | 'rejected',
): void {
  for (const notice of record.data.notices) {
    stmt.run(subject.folder, notice.id, notice.severity, null, outcome);
  }
}

/** One row per recorded manifest notice, `opened` 1, 0, or null. */
function insertManifestNotices(
  stmt: StatementSync,
  subject: NoticeSubject,
  notices: ManifestNotices,
): void {
  const outcome = subject.rejected ? 'rejected' : subject.halts > 0 ? 'halted' : 'approved';
  for (const item of notices.items) {
    const opened = notices.opened === null ? null : notices.opened.includes(item.id) ? 1 : 0;
    stmt.run(subject.folder, item.id, item.severity, opened, outcome);
  }
}

/** Every row one archived or rejected change contributes, in order. */
async function insertSubject(stmt: StatementSync, subject: NoticeSubject): Promise<void> {
  const [records, manifest] = await Promise.all([
    readPlanReady(subject.folderPath),
    readManifestObject(subject.folderPath),
  ]);
  for (const record of records.slice(0, -1)) {
    insertPlanNotices(stmt, subject, record, 'planned_again');
  }
  const notices = parseManifestNotices(manifest?.notices);
  if (notices !== null) {
    insertManifestNotices(stmt, subject, notices);
    return;
  }
  if (!subject.rejected) return;
  const last = records[records.length - 1];
  if (last) insertPlanNotices(stmt, subject, last, 'rejected');
}

/** The archived and rejected changes, with halt counts, in folder order. */
async function listSubjects(projectRoot: string, config: OsqConfig): Promise<NoticeSubject[]> {
  const [archived, archivedLocated, rejected] = await Promise.all([
    listArchivedChanges(projectRoot, config),
    listChanges(projectRoot, config, ['archived']),
    listChanges(projectRoot, config, ['rejected']),
  ]);
  const paths = new Map(archivedLocated.map((change) => [change.folderName, change.folderPath]));
  const subjects: NoticeSubject[] = [];
  for (const record of archived) {
    const folderPath = paths.get(record.folder);
    if (folderPath === undefined) continue;
    subjects.push({
      folder: record.folder,
      folderPath,
      rejected: false,
      halts: record.tasks.halts ?? 0,
    });
  }
  for (const change of rejected) {
    subjects.push({
      folder: change.folderName,
      folderPath: change.folderPath,
      rejected: true,
      halts: 0,
    });
  }
  return subjects.sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
}

/**
 * Fills the `notices` table from every archived and rejected change, in folder
 * order, reading each change's `plan_ready` records and manifest.
 *
 * @scenario metrics-and-reporting: Outcomes by change
 * @adr 008
 */
export async function insertNotices(
  db: DatabaseSync,
  projectRoot: string,
  config: OsqConfig,
): Promise<void> {
  const stmt = db.prepare('INSERT INTO notices VALUES (?, ?, ?, ?, ?)');
  for (const subject of await listSubjects(projectRoot, config)) {
    await insertSubject(stmt, subject);
  }
}
