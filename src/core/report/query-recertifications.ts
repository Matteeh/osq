/**
 * Fills the `recertifications` query table from the numbered task streams of
 * every archived change: one row per attribution entry of each
 * `recertification` event.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { HistoryTable, TrialSubject } from './query-subjects.js';
import { asData } from './report-events.js';
import { readEventStream } from './stream-reads.js';

export const RECERTIFICATION_TABLES: readonly HistoryTable[] = [
  {
    name: 'recertifications',
    columns: [
      'change',
      'task',
      'recertified_at',
      'outcome',
      'automatic',
      'path',
      'credited_to',
      'source',
    ],
  },
];

/** The value as a string, or null when it is of another type. */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** A string that is a task number, else null. */
function asTaskNumber(value: unknown): string | null {
  return typeof value === 'string' && /^\d+$/.test(value) ? value : null;
}

/** Task stream files, whose names are digits and `.jsonl`, in numeric order. */
async function listTaskStreams(folderPath: string): Promise<string[]> {
  const dir = path.join(folderPath, '.run', 'events');
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  return entries
    .filter((entry) => /^\d+\.jsonl$/.test(entry))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

/**
 * The `source` of one attribution entry: `measures` when the entry carries
 * `source: "measures"`, else `file_changed` when its `attribution` is a task
 * number, else null.
 */
function entrySource(entry: Record<string, unknown>): string | null {
  if (entry.source === 'measures') return 'measures';
  return asTaskNumber(entry.attribution) === null ? null : 'file_changed';
}

/** One row per attribution entry of one `recertification` event. */
function insertEvent(
  stmt: ReturnType<DatabaseSync['prepare']>,
  folder: string,
  event: Readonly<Record<string, unknown>>,
  data: Record<string, unknown>,
): void {
  const attribution = data.attribution;
  if (!Array.isArray(attribution)) return;
  for (const raw of attribution) {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const entry = raw as Record<string, unknown>;
    stmt.run(
      folder,
      asString(data.task),
      asString(event.timestamp),
      asString(data.outcome),
      data.automatic === true ? 1 : 0,
      asString(entry.path),
      asString(entry.attribution),
      entrySource(entry),
    );
  }
}

/**
 * Fills `recertifications` from every attribution entry of each
 * `recertification` event in the numbered task streams of every archived
 * change, in folder order, numeric task order, and entry order. `change` is
 * the folder name, `task`/`outcome` come from the event's object `data`,
 * `recertified_at` is the event's `timestamp`, `automatic` is 1 only when
 * `data.automatic` is `true`, and `path`/`credited_to` come from the entry's
 * `path` and `attribution`. An event without object `data`, or whose
 * `data.attribution` is not an array, adds no row; an entry that is not an
 * object adds no row, and a field of the wrong type reads as null. The table
 * is stored nowhere.
 *
 * @scenario metrics-and-reporting: Recertifications of one archived change
 * @scenario metrics-and-reporting: No recertifications
 * @scenario metrics-and-reporting: Recertifications listed
 * @adr 008
 */
export async function insertRecertifications(
  db: DatabaseSync,
  subjects: readonly TrialSubject[],
): Promise<void> {
  const stmt = db.prepare('INSERT INTO recertifications VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for (const subject of subjects) {
    for (const fileName of await listTaskStreams(subject.folderPath)) {
      const stream = path.join(subject.folderPath, '.run', 'events', fileName);
      const events = (await readEventStream(stream)) ?? [];
      for (const event of events) {
        if (event.type !== 'recertification') continue;
        const data = asData(event);
        if (data === null) continue;
        insertEvent(stmt, subject.folder, event, data);
      }
    }
  }
}
