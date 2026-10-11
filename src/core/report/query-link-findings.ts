/** Fills the trial `link_findings` query table from each change's last plan_ready record. */

import type { DatabaseSync } from 'node:sqlite';
import { readPlanReady } from '../spec/plan-ready.js';
import type { HistoryTable, TrialSubject } from './query-subjects.js';

export const LINK_FINDINGS_TABLES: readonly HistoryTable[] = [
  { name: 'link_findings', columns: ['id', 'change', 'severity', 'file', 'message', 'label'] },
];

/**
 * Fills `link_findings` from the `traceability` list of the last `plan_ready`
 * record of each archived change, in folder order, with positional ids. A change
 * whose last record has no list adds no row. Every label is null; the label pass
 * fills it later.
 *
 * @scenario metrics-and-reporting: Trial rows of one archived change
 * @adr 008
 */
export async function insertLinkFindings(
  db: DatabaseSync,
  subjects: readonly TrialSubject[],
): Promise<void> {
  const stmt = db.prepare('INSERT INTO link_findings VALUES (?, ?, ?, ?, ?, ?)');
  for (const subject of subjects) {
    const records = await readPlanReady(subject.folderPath);
    const last = records[records.length - 1];
    if (last === undefined || last.data.traceability === undefined) continue;
    last.data.traceability.forEach((entry, index) => {
      stmt.run(
        `${subject.id}.l${index + 1}`,
        subject.folder,
        entry.severity,
        entry.file,
        entry.message,
        null,
      );
    });
  }
}
