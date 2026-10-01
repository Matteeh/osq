/** One read-only SELECT over the in-memory history tables, formatted for output. */

import os from 'node:os';
import path from 'node:path';
import type { StatementSync } from 'node:sqlite';
import type { OsqConfig } from '../foundation/config.js';
import { HISTORY_TABLES, buildHistoryTables } from './query-tables.js';

type Database = import('node:sqlite').DatabaseSync;
type Constants = typeof import('node:sqlite').constants;
type SqlValue = import('node:sqlite').SQLOutputValue;

/** A refused history query. The message names the cause and lists the tables. */
export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

/** One statement prepared under the authorizer, with its result column names. */
interface PreparedQuery {
  readonly statement: StatementSync;
  readonly columns: readonly string[];
}

/** The table list: one `name(column, column, ...)` line per table. */
export function formatTableList(): string {
  return HISTORY_TABLES.map((table) => `${table.name}(${table.columns.join(', ')})`).join('\n');
}

/** An empty in-memory database carrying only the five tables' schema. */
function createSchemaDatabase(DatabaseSync: typeof import('node:sqlite').DatabaseSync): Database {
  const db = new DatabaseSync(':memory:');
  for (const table of HISTORY_TABLES) {
    db.exec(`CREATE TABLE ${table.name} (${table.columns.join(', ')})`);
  }
  return db;
}

/** A refusal message: the cause, then every allowed table with its columns. */
function refusal(cause: string): string {
  return `${cause}\n${formatTableList()}`;
}

/** A human cause for one denied authorizer action. */
function denialCause(constants: Constants, code: number, arg1: string | null): string {
  const writes = [constants.SQLITE_INSERT, constants.SQLITE_UPDATE, constants.SQLITE_DELETE];
  if (writes.includes(code)) return 'osq query refused: the statement would write to the database';
  if (code === constants.SQLITE_PRAGMA)
    return 'osq query refused: the statement would run a pragma';
  if (code === constants.SQLITE_ATTACH || code === constants.SQLITE_DETACH) {
    return 'osq query refused: the statement would attach a database';
  }
  if (code === constants.SQLITE_READ) {
    return `osq query refused: the statement would read a table osq does not expose (${arg1 ?? 'unknown'})`;
  }
  return 'osq query refused: the statement is not a read-only SELECT over the history tables';
}

/**
 * The authorizer that allows only a SELECT, a READ of one of the five tables,
 * a function, and a recursive CTE, and denies every other action.
 */
function allowlistAuthorizer(
  constants: Constants,
  onDeny: (code: number, arg1: string | null) => void,
): (code: number, arg1: string | null) => number {
  const readable = new Set(HISTORY_TABLES.map((table) => table.name));
  return (code, arg1) => {
    if (code === constants.SQLITE_SELECT) return constants.SQLITE_OK;
    if (code === constants.SQLITE_FUNCTION) return constants.SQLITE_OK;
    if (code === constants.SQLITE_RECURSIVE) return constants.SQLITE_OK;
    if (code === constants.SQLITE_READ && arg1 !== null && readable.has(arg1)) {
      return constants.SQLITE_OK;
    }
    onDeny(code, arg1);
    return constants.SQLITE_DENY;
  };
}

/** Trims trailing whitespace and then at most one trailing `;`. */
function withoutTrailingSemicolon(text: string): string {
  const trimmed = text.replace(/\s+$/, '');
  return trimmed.endsWith(';') ? trimmed.slice(0, -1) : trimmed;
}

/**
 * Prepares `select` under the authorizer and refuses a write, pragma, attach,
 * unknown table, or a second statement before the statement can run.
 */
function authorizeAndPrepare(db: Database, constants: Constants, select: string): PreparedQuery {
  const seen: { denial: { code: number; arg1: string | null } | null } = { denial: null };
  db.setAuthorizer(
    allowlistAuthorizer(constants, (code, arg1) => {
      seen.denial ??= { code, arg1 };
    }),
  );

  let statement: StatementSync;
  try {
    statement = db.prepare(select);
  } catch (error) {
    const cause =
      seen.denial === null
        ? `osq query refused: ${error instanceof Error ? error.message : String(error)}`
        : denialCause(constants, seen.denial.code, seen.denial.arg1);
    throw new QueryError(refusal(cause));
  }

  if (
    withoutTrailingSemicolon(select).length > withoutTrailingSemicolon(statement.sourceSQL).length
  ) {
    throw new QueryError(
      refusal('osq query refused: the input holds a second statement after the first'),
    );
  }
  return { statement, columns: statement.columns().map((column) => column.name) };
}

/** A string value with the project root replaced by `.` and home by `~`. */
function rewritePaths(value: SqlValue, root: string, home: string): SqlValue {
  if (typeof value !== 'string') return value;
  return value.split(root).join('.').split(home).join('~');
}

/** One cell, with null as an empty field and a newline as `\n`. */
function cellText(value: SqlValue, root: string, home: string): string {
  if (value === null) return '';
  return String(rewritePaths(value, root, home)).replace(/\n/g, '\\n');
}

/** The header row and one tab-separated row per result. */
function formatText(
  columns: readonly string[],
  rows: readonly SqlValue[][],
  root: string,
  home: string,
): string {
  const lines = [columns.join('\t')];
  for (const row of rows) {
    lines.push(row.map((value) => cellText(value, root, home)).join('\t'));
  }
  return lines.join('\n');
}

/** A JSON array of one object per result, in column order. */
function formatJson(
  columns: readonly string[],
  rows: readonly SqlValue[][],
  root: string,
  home: string,
): string {
  const objects = rows.map((row) =>
    Object.fromEntries(
      columns.map((column, index) => [column, rewritePaths(row[index] ?? null, root, home)]),
    ),
  );
  return JSON.stringify(objects);
}

export interface QueryOptions {
  readonly json?: boolean;
}

/**
 * Builds the history tables, runs one authorized SELECT over them, and returns
 * the formatted output. Without a statement it returns the table list. A
 * refused statement is checked against a schema-only database first, so it
 * never builds the tables and never touches a file. The database it does build
 * is closed afterwards.
 */
export async function runQuery(
  projectRoot: string,
  config: OsqConfig,
  select: string | null,
  options: QueryOptions = {},
): Promise<string> {
  if (select === null || select.trim() === '') return formatTableList();

  const { DatabaseSync, constants } = await import('node:sqlite');
  const validation = createSchemaDatabase(DatabaseSync);
  try {
    authorizeAndPrepare(validation, constants, select);
  } finally {
    validation.close();
  }

  const db = await buildHistoryTables(projectRoot, config);
  try {
    const { statement, columns } = authorizeAndPrepare(db, constants, select);
    statement.setReturnArrays(true);
    const rows = statement.all() as unknown as SqlValue[][];
    const root = path.resolve(projectRoot);
    const home = os.homedir();
    return options.json
      ? formatJson(columns, rows, root, home)
      : formatText(columns, rows, root, home);
  } finally {
    db.close();
  }
}
