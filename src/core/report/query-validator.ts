/** Fills the trial `validator_runs` and `validator_findings` query tables. */

import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HistoryTable, TrialSubject } from './query-subjects.js';
import { type ValidatorRun, readValidatorRuns } from './validator-runs.js';

export const VALIDATOR_TABLES: readonly HistoryTable[] = [
  {
    name: 'validator_runs',
    columns: [
      'change',
      'run',
      'outcome',
      'harness',
      'model',
      'duration',
      'exit_code',
      'scenarios',
      'findings',
      'reason',
      'output',
    ],
  },
  {
    name: 'validator_findings',
    columns: [
      'id',
      'change',
      'run',
      'finding',
      'capability',
      'requirement',
      'scenario',
      'problem',
      'detail',
      'label',
    ],
  },
];

/** One validator run row, then one row per finding with its positional id. */
function insertValidatorRun(
  runs: StatementSync,
  findings: StatementSync,
  subject: TrialSubject,
  run: ValidatorRun,
): void {
  runs.run(
    subject.folder,
    run.run,
    run.outcome,
    run.harness,
    run.model,
    run.duration,
    run.exitCode,
    run.scenarios,
    run.findings.length,
    run.reason,
    run.output,
  );
  run.findings.forEach((finding, index) => {
    findings.run(
      `${subject.id}.v${run.run}.${index + 1}`,
      subject.folder,
      run.run,
      index + 1,
      finding.capability,
      finding.requirement,
      finding.scenario,
      finding.problem,
      finding.detail,
      null,
    );
  });
}

/**
 * Fills `validator_runs` and `validator_findings` from every archived change's
 * `validator_ran` events, in folder order. Every label is null; the label pass
 * fills it later.
 *
 * @scenario metrics-and-reporting: Trial rows of one archived change
 * @adr 008
 */
export async function insertValidatorTables(
  db: DatabaseSync,
  subjects: readonly TrialSubject[],
): Promise<void> {
  const runs = db.prepare('INSERT INTO validator_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const findings = db.prepare(
    'INSERT INTO validator_findings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  );
  for (const subject of subjects) {
    for (const run of await readValidatorRuns(subject.folderPath)) {
      insertValidatorRun(runs, findings, subject, run);
    }
  }
}
