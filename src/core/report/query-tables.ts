/** In-memory history query tables, built from archived change files on demand. */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { OsqConfig } from '../foundation/config.js';
import { parseTaskMd } from '../spec/parser.js';
import { changeTrees, listChanges } from '../status/change-locations.js';
import { type ArchivedChangeRecord, listArchivedChanges } from './archive-record.js';
import { observeTaskStream } from './report-events.js';
import { readChangeDisclosures } from './result-sections.js';
import { openStreamIndex } from './stream-index.js';
import { readEventStream, withStreamReads } from './stream-reads.js';

/** One history table's name and ordered columns. */
export interface HistoryTable {
  readonly name: string;
  readonly columns: readonly string[];
}

/** The five documented tables, in the order the delta names them. */
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

/** The empty in-memory database holding the five tables and nothing else. */
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

/** Fills the five tables from the archived changes, in folder and task order. */
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
  for (const change of records) {
    const folderPath = paths.get(change.folder);
    if (folderPath === undefined) continue;
    insertChanges(db, change);
    insertRequirements(db, change);
    await insertTasks(db, folderPath, change.folder);
    insertDeadAttempts(db, change);
    await insertDisclosures(db, folderPath, change.folder);
  }
  return db;
}

/**
 * Builds the five history tables of archived changes in an in-memory database.
 * Event streams are read through the archive's derived index when it opens;
 * the index is closed before this resolves, even when a read throws.
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
