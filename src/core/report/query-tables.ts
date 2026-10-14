/** In-memory history query tables, built from archived change files on demand. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { OsqConfig } from '../foundation/config.js';
import { parseTaskMd } from '../spec/parser.js';
import { changeTrees, listChanges } from '../status/change-locations.js';
import { type ArchivedChangeRecord, listArchivedChanges } from './archive-record.js';
import { LINK_FINDINGS_TABLES, insertLinkFindings } from './query-link-findings.js';
import { insertNotices } from './query-notices.js';
import { PAUSE_TABLES, insertPauses } from './query-pauses.js';
import { type HistoryTable, type TrialSubject, folderId } from './query-subjects.js';
import { TASK_OUTCOME_TABLES, insertTaskOutcomes } from './query-task-outcomes.js';
import { TASK_STREAM_TABLES, insertTaskStreamTables } from './query-task-streams.js';
import { VALIDATOR_TABLES, insertValidatorTables } from './query-validator.js';
import { observeTaskStream } from './report-events.js';
import { readChangeDisclosures } from './result-sections.js';
import { openStreamIndex } from './stream-index.js';
import { readEventStream, withStreamReads } from './stream-reads.js';
import { applyTrialLabels } from './trial-labels.js';

export type { HistoryTable } from './query-subjects.js';

/** The documented tables: the history tables, then the trial tables in delta order. */
export const HISTORY_TABLES: readonly HistoryTable[] = [
  {
    name: 'changes',
    columns: [
      'id',
      'folder',
      'title',
      'archived_on',
      'goal',
      'tasks',
      'attempts',
      'halts',
      'elapsed_seconds',
      'cost',
      'planner',
    ],
  },
  {
    name: 'requirements',
    columns: ['change', 'capability', 'kind', 'requirement', 'renamed_from'],
  },
  { name: 'tasks', columns: ['change', 'task', 'title', 'attempts', 'done'] },
  { name: 'dead_attempts', columns: ['change', 'task', 'reason'] },
  { name: 'disclosures', columns: ['change', 'task', 'section', 'text'] },
  { name: 'notices', columns: ['change', 'notice', 'severity', 'opened', 'outcome'] },
  ...VALIDATOR_TABLES,
  ...TASK_STREAM_TABLES,
  ...LINK_FINDINGS_TABLES,
  ...TASK_OUTCOME_TABLES,
  ...PAUSE_TABLES,
];

/** Requirement kinds besides `renamed`, each mapping straight to its own rows. */
const REQUIREMENT_KINDS = ['added', 'modified', 'removed'] as const;

/** Disclosure section keys, with the column's snake_case label. */
const DISCLOSURE_SECTIONS = [
  ['deviated', 'deviated'],
  ['missing_context', 'missingContext'],
  ['outside_scope', 'outsideScope'],
] as const;

type DatabaseConstructor = typeof import('node:sqlite').DatabaseSync;

const TASKS_DIR = 'tasks';
const EVENTS_DIR = path.join('.run', 'events');
const DONE_DIR = path.join('.run', 'done');

/** The empty in-memory database holding the six tables and nothing else. */
function createTables(DatabaseSync: DatabaseConstructor): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const table of HISTORY_TABLES) {
    db.exec(`CREATE TABLE ${table.name} (${table.columns.join(', ')})`);
  }
  return db;
}

/** One row per change, elapsed time rounded from milliseconds to seconds. */
function insertChanges(db: DatabaseSync, change: ArchivedChangeRecord): void {
  db.prepare('INSERT INTO changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    change.id,
    change.folder,
    change.title,
    change.archivedOn,
    change.goal,
    change.tasks.count,
    change.tasks.attempts,
    change.tasks.halts,
    change.elapsedMs === null ? null : Math.round(change.elapsedMs / 1000),
    change.cost,
    change.planner,
  );
}

/** One row per delta requirement; a rename keys on the new name. */
function insertRequirements(db: DatabaseSync, change: ArchivedChangeRecord): void {
  const stmt = db.prepare('INSERT INTO requirements VALUES (?, ?, ?, ?, ?)');
  for (const capability of change.capabilities) {
    for (const kind of REQUIREMENT_KINDS) {
      for (const requirement of capability[kind]) {
        stmt.run(change.folder, capability.name, kind, requirement, null);
      }
    }
    for (const rename of capability.renamed) {
      stmt.run(change.folder, capability.name, 'renamed', rename.to, rename.from);
    }
  }
}

/** Task file base names in numeric order. */
async function listTaskFiles(folderPath: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(folderPath, TASKS_DIR)).catch(() => [] as string[]);
  return entries
    .filter((entry) => entry.endsWith('.md'))
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

/** A task file's frontmatter title, or empty text when it cannot be read. */
async function readTaskTitle(folderPath: string, fileName: string): Promise<string> {
  const content = await fs
    .readFile(path.join(folderPath, TASKS_DIR, fileName), 'utf8')
    .catch(() => null);
  return content === null ? '' : parseTaskMd(content).title;
}

/** Whether the task's `.run/done/<n>` marker exists. */
async function isDone(folderPath: string, task: string): Promise<boolean> {
  return (await fs.stat(path.join(folderPath, DONE_DIR, task)).catch(() => null)) !== null;
}

/** One row per `tasks/<n>.md`: its title, its stream's attempts, its done marker. */
async function insertTasks(db: DatabaseSync, folderPath: string, change: string): Promise<void> {
  const stmt = db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?)');
  for (const fileName of await listTaskFiles(folderPath)) {
    const task = fileName.replace(/\.md$/, '');
    const events = await readEventStream(path.join(folderPath, EVENTS_DIR, `${task}.jsonl`));
    stmt.run(
      change,
      task,
      await readTaskTitle(folderPath, fileName),
      events === null ? 0 : observeTaskStream(events).attempts,
      (await isDone(folderPath, task)) ? 1 : 0,
    );
  }
}

/** One row per dead attempt the change's streams recorded. */
function insertDeadAttempts(db: DatabaseSync, change: ArchivedChangeRecord): void {
  const stmt = db.prepare('INSERT INTO dead_attempts VALUES (?, ?, ?)');
  for (const dead of change.tasks.dead ?? []) {
    stmt.run(change.folder, dead.task, dead.reason);
  }
}

/** One row per non-null disclosure section of each task result. */
async function insertDisclosures(
  db: DatabaseSync,
  folderPath: string,
  change: string,
): Promise<void> {
  const stmt = db.prepare('INSERT INTO disclosures VALUES (?, ?, ?, ?)');
  for (const task of await readChangeDisclosures(folderPath)) {
    for (const [section, key] of DISCLOSURE_SECTIONS) {
      const text = task[key];
      if (text !== null) stmt.run(change, task.task, section, text);
    }
  }
}

/** Fills the six tables from the archived changes, in folder and task order. */
async function build(
  projectRoot: string,
  config: OsqConfig,
  DatabaseSync: DatabaseConstructor,
): Promise<DatabaseSync> {
  const db = createTables(DatabaseSync);
  const [records, located] = await Promise.all([
    listArchivedChanges(projectRoot, config),
    listChanges(projectRoot, config, ['archived']),
  ]);
  const paths = new Map(located.map((change) => [change.folderName, change.folderPath]));
  const subjects: TrialSubject[] = located.map((change) => ({
    folder: change.folderName,
    folderPath: change.folderPath,
    id: folderId(change.folderName),
  }));
  for (const change of records) {
    const folderPath = paths.get(change.folder);
    if (folderPath === undefined) continue;
    insertChanges(db, change);
    insertRequirements(db, change);
    await insertTasks(db, folderPath, change.folder);
    insertDeadAttempts(db, change);
    await insertDisclosures(db, folderPath, change.folder);
    await insertTaskOutcomes(db, projectRoot, config, change, folderPath);
  }
  await insertNotices(db, projectRoot, config);
  await insertValidatorTables(db, subjects);
  await insertTaskStreamTables(db, subjects);
  await insertLinkFindings(db, subjects);
  await insertPauses(db, subjects);
  await applyTrialLabels(db, projectRoot, config);
  return db;
}

/**
 * Builds the six history tables of archived and rejected changes in an
 * in-memory database. Event streams are read through the archive's derived
 * index when it opens; the index is closed before this resolves, even when a
 * read throws.
 */
export async function buildHistoryTables(
  projectRoot: string,
  config: OsqConfig,
): Promise<DatabaseSync> {
  const { DatabaseSync } = await import('node:sqlite');
  const [tree] = await changeTrees(projectRoot, config);
  const index = await openStreamIndex(projectRoot, tree.archiveDir);
  try {
    return await withStreamReads(
      () => build(projectRoot, config, DatabaseSync),
      index ?? undefined,
    );
  } finally {
    index?.close();
  }
}
