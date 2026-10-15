/**
 * Fills the `manual_edits` query table from the project's manual edit records:
 * one row per record under `<openspecRoot>/manual/`.
 */

import type { DatabaseSync } from 'node:sqlite';
import type { OsqConfig } from '../foundation/config.js';
import { readManualEditRecords } from '../vcs/manual-records.js';
import type { HistoryTable } from './query-subjects.js';

export const MANUAL_EDIT_TABLES: readonly HistoryTable[] = [
  {
    name: 'manual_edits',
    columns: ['kept_at', 'record', 'comment', 'paths', 'capabilities'],
  },
];

/** A list joined with `, `, an empty list reading as the empty string. */
function joinList(values: readonly string[]): string {
  return values.join(', ');
}

/**
 * Fills `manual_edits` from `readManualEditRecords`, one row per manual edit
 * record in `kept_at` order. `record` is the record's file name, `comment` its
 * whole comment, and `paths` and `capabilities` its lists joined with `, `, an
 * empty list reading as the empty string. The table is stored nowhere.
 *
 * @scenario metrics-and-reporting: Manual edits of a project
 * @scenario metrics-and-reporting: No manual edits
 * @scenario metrics-and-reporting: Manual edits listed
 * @adr 008
 */
export async function insertManualEdits(
  db: DatabaseSync,
  projectRoot: string,
  config: OsqConfig,
): Promise<void> {
  const stmt = db.prepare('INSERT INTO manual_edits VALUES (?, ?, ?, ?, ?)');
  for (const record of await readManualEditRecords(projectRoot, config)) {
    stmt.run(
      record.keptAt,
      record.file,
      record.comment,
      joinList(record.paths),
      joinList(record.capabilities),
    );
  }
}
