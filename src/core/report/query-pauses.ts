/**
 * Fills the `pauses` query table from the numbered task streams of every
 * archived change: one row per `paused` event.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { HistoryTable, TrialSubject } from './query-subjects.js';
import { asData } from './report-events.js';
import { readEventStream } from './stream-reads.js';

export const PAUSE_TABLES: readonly HistoryTable[] = [
  { name: 'pauses', columns: ['change', 'task', 'paused_at', 'until', 'source'] },
];

/** The value as a string, or null when it is of another type. */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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
 * Fills `pauses` from every `paused` event in the numbered task streams of
 * every archived change, in folder order and numeric task order. `change` is
 * the folder name, `task`/`until`/`source` come from the event's object `data`,
 * and `paused_at` is the event's `timestamp`. An event without object `data`
 * adds no row, and a field of the wrong type reads as null. The table is stored
 * nowhere.
 *
 * @scenario metrics-and-reporting: Pauses of one archived change
 * @scenario metrics-and-reporting: No pauses
 * @scenario metrics-and-reporting: Pauses listed
 * @adr 008
 */
export async function insertPauses(
  db: DatabaseSync,
  subjects: readonly TrialSubject[],
): Promise<void> {
  const stmt = db.prepare('INSERT INTO pauses VALUES (?, ?, ?, ?, ?)');
  for (const subject of subjects) {
    for (const entry of await listTaskStreams(subject.folderPath)) {
      const stream = path.join(subject.folderPath, '.run', 'events', entry);
      const events = (await readEventStream(stream)) ?? [];
      for (const event of events) {
        if (event.type !== 'paused') continue;
        const data = asData(event);
        if (data === null) continue;
        stmt.run(
          subject.folder,
          asString(data.task),
          asString(event.timestamp),
          asString(data.until),
          asString(data.source),
        );
      }
    }
  }
}
