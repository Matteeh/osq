/** Fills the `task_outcomes` query table from every archived change. */

import type { DatabaseSync } from 'node:sqlite';
import type { OsqConfig } from '../foundation/config.js';
import type { ArchivedChangeRecord } from './archive-record.js';
import type { HistoryTable } from './query-subjects.js';
import { type TaskOutcomeRow, deriveTaskOutcomes } from './task-outcomes.js';

export const TASK_OUTCOME_TABLES: readonly HistoryTable[] = [
  {
    name: 'task_outcomes',
    columns: [
      'change',
      'task',
      'capability',
      'scope_globs',
      'scope_files',
      'verify_kind',
      'tests_modify',
      'verify_starts',
      'shares_scope',
      'position',
      'attempts',
      'first_attempt',
      'dead_reason',
      'files_touched',
    ],
  },
];

/** One row's values in the table's column order. */
function values(row: TaskOutcomeRow): readonly (string | number | null)[] {
  return [
    row.change,
    row.task,
    row.capability,
    row.scopeGlobs,
    row.scopeFiles,
    row.verifyKind,
    row.testsModify,
    row.verifyStarts,
    row.sharesScope,
    row.position,
    row.attempts,
    row.firstAttempt,
    row.deadReason,
    row.filesTouched,
  ];
}

/**
 * Fills `task_outcomes` with one row per `tasks/<n>.md` of one archived change,
 * in numeric task order, from the change files. Event streams are read through
 * the index; the table is stored nowhere.
 *
 * @scenario metrics-and-reporting: Task outcomes of one archived change
 * @scenario metrics-and-reporting: Task outcomes listed
 * @adr 008
 */
export async function insertTaskOutcomes(
  db: DatabaseSync,
  projectRoot: string,
  config: OsqConfig,
  change: ArchivedChangeRecord,
  folderPath: string,
): Promise<void> {
  const rows = await deriveTaskOutcomes({ projectRoot, config, change, folderPath });
  const stmt = db.prepare(
    'INSERT INTO task_outcomes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const row of rows) stmt.run(...values(row));
}
