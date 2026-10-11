/**
 * Fills the trial `focused_runs`, `mutation_picks` and `mutation_survivors`
 * query tables from the numbered task streams of every archived change.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { HistoryTable, TrialSubject } from './query-subjects.js';
import { asData } from './report-events.js';
import { readEventStream } from './stream-reads.js';

export const TASK_STREAM_TABLES: readonly HistoryTable[] = [
  {
    name: 'focused_runs',
    columns: [
      'change',
      'task',
      'run',
      'outcome',
      'exit_code',
      'duration',
      'timed_out',
      'scenarios',
      'files',
    ],
  },
  {
    name: 'mutation_picks',
    columns: [
      'change',
      'task',
      'pick',
      'file',
      'function',
      'outcome',
      'reason',
      'killed',
      'survived',
      'invalid',
      'duration',
      'scenarios',
    ],
  },
  {
    name: 'mutation_survivors',
    columns: [
      'id',
      'change',
      'task',
      'pick',
      'file',
      'function',
      'line',
      'column',
      'mutator',
      'replacement',
      'label',
    ],
  },
];

/** The value as a string, or null when it is of another type. */
function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** The value as a finite number, or null when it is of another type. */
function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** The value as 1 or 0, or null when it is not a boolean. */
function asFlag(value: unknown): number | null {
  return typeof value === 'boolean' ? (value ? 1 : 0) : null;
}

/** A string array's entries joined by a newline, or null when not an array. */
function joined(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  return value.map((entry) => (typeof entry === 'string' ? entry : String(entry))).join('\n');
}

/** One `focused_ran` row with its 1-based position in the stream. */
function insertFocusedRun(
  stmt: StatementSync,
  subject: TrialSubject,
  task: string,
  run: number,
  data: Record<string, unknown>,
): void {
  stmt.run(
    subject.folder,
    task,
    run,
    asString(data.outcome),
    asNumber(data.exitCode),
    asNumber(data.duration),
    asFlag(data.timedOut),
    joined(data.scenarios),
    joined(data.files),
  );
}

/** One `mutation_ran` pick row, then one row per survivor entry. */
function insertMutation(
  pickStmt: StatementSync,
  survivorStmt: StatementSync,
  subject: TrialSubject,
  task: string,
  pick: number,
  data: Record<string, unknown>,
): void {
  const file = asString(data.file);
  const functionName = asString(data.function);
  pickStmt.run(
    subject.folder,
    task,
    pick,
    file,
    functionName,
    asString(data.outcome),
    asString(data.reason),
    asNumber(data.killed),
    asNumber(data.survived),
    asNumber(data.invalid),
    asNumber(data.duration),
    joined(data.scenarios),
  );
  if (!Array.isArray(data.survivors)) return;
  data.survivors.forEach((entry, index) => {
    const record =
      entry !== null && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    survivorStmt.run(
      `${subject.id}.${task}.m${pick}.${index + 1}`,
      subject.folder,
      task,
      pick,
      asString(record.file),
      functionName,
      asNumber(record.line),
      asNumber(record.column),
      asString(record.mutator),
      asString(record.replacement),
      null,
    );
  });
}

/** The prepared inserts one build uses for the three task-stream tables. */
interface StreamStatements {
  readonly focused: StatementSync;
  readonly pick: StatementSync;
  readonly survivor: StatementSync;
}

/** Every row one numbered task stream contributes, in event order. */
async function insertTaskStream(
  stmts: StreamStatements,
  subject: TrialSubject,
  task: string,
): Promise<void> {
  const stream = path.join(subject.folderPath, '.run', 'events', `${task}.jsonl`);
  const events = (await readEventStream(stream)) ?? [];
  let focusedRun = 0;
  let pick = 0;
  for (const event of events) {
    if (event.type === 'focused_ran') {
      focusedRun++;
      const data = asData(event);
      if (data !== null) insertFocusedRun(stmts.focused, subject, task, focusedRun, data);
    } else if (event.type === 'mutation_ran') {
      pick++;
      const data = asData(event);
      if (data !== null) insertMutation(stmts.pick, stmts.survivor, subject, task, pick, data);
    }
  }
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
 * Fills `focused_runs`, `mutation_picks` and `mutation_survivors` from every
 * numbered task stream of every archived change, in folder order. Every label is
 * null; the label pass fills it later.
 *
 * @scenario metrics-and-reporting: Trial rows of one archived change
 * @adr 008
 */
export async function insertTaskStreamTables(
  db: DatabaseSync,
  subjects: readonly TrialSubject[],
): Promise<void> {
  const stmts: StreamStatements = {
    focused: db.prepare('INSERT INTO focused_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    pick: db.prepare('INSERT INTO mutation_picks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    survivor: db.prepare('INSERT INTO mutation_survivors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  };
  for (const subject of subjects) {
    for (const entry of await listTaskStreams(subject.folderPath)) {
      await insertTaskStream(stmts, subject, entry.replace(/\.jsonl$/, ''));
    }
  }
}
