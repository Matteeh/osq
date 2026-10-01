/** Derived SQLite read index of archived event streams. Never a source of truth. */

import fs from 'node:fs';
import path from 'node:path';

/** The report's view of the SQLite index; every method tolerates failure. */
export interface StreamIndex {
  /** True when the path lies under the archive folder this index covers. */
  covers(filePath: string): boolean;
  /** The stored events JSON when path, size and modification time all match. */
  lookup(filePath: string, size: number, mtimeMs: number): string | null;
  /** Replaces the row for one path with the given events JSON. */
  store(filePath: string, size: number, mtimeMs: number, eventsJson: string): void;
  /** Drops rows for removed files the session never looked up, then closes. */
  close(): void;
}

/** A `node:sqlite` connection, and the class that opens one. */
type Database = import('node:sqlite').DatabaseSync;
type DatabaseConstructor = typeof import('node:sqlite').DatabaseSync;

/** Index location and layout constants. */
const OSQ_DIR = '.osq';
const DB_FILE = 'index.sqlite';
const GITIGNORE_FILE = '.gitignore';
const GITIGNORE_CONTENT = '*\n';
const SCHEMA_VERSION = '1';

/** Side files SQLite's WAL mode keeps next to the database. */
const DATABASE_SIDE_FILES = ['', '-wal', '-shm'];

/** `meta` holds the schema version; `streams` holds one event stream per row. */
const META_TABLE = 'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)';
const STREAMS_TABLE = `CREATE TABLE IF NOT EXISTS streams (
  path TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mtime_ms REAL NOT NULL,
  events_json TEXT NOT NULL
)`;

/** Creates `<projectRoot>/.osq/`, its gitignore, and returns the database path. */
function prepareDirectory(projectRoot: string): string {
  const osqDir = path.join(path.resolve(projectRoot), OSQ_DIR);
  fs.mkdirSync(osqDir, { recursive: true });
  const gitignore = path.join(osqDir, GITIGNORE_FILE);
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, GITIGNORE_CONTENT, 'utf8');
  return path.join(osqDir, DB_FILE);
}

/** Removes the database and its WAL side files, ignoring any failure. */
function removeDatabase(dbPath: string): void {
  for (const suffix of DATABASE_SIDE_FILES) {
    try {
      fs.rmSync(`${dbPath}${suffix}`, { force: true });
    } catch {}
  }
}

/** Empty a `streams` table laid out for another schema version, keeping meta. */
function initializeSchema(db: Database): void {
  db.exec(META_TABLE);
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  const current = row?.value === SCHEMA_VERSION;
  if (!current) db.exec('DROP TABLE IF EXISTS streams');
  db.exec(STREAMS_TABLE);
  if (!current) {
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(
      'schema_version',
      SCHEMA_VERSION,
    );
  }
}

/** Opens the WAL database with a zero busy timeout, or null when that fails. */
function openDatabase(dbPath: string, DatabaseSync: DatabaseConstructor): Database | null {
  let db: Database | null = null;
  try {
    db = new DatabaseSync(dbPath, { timeout: 0 });
    db.exec('PRAGMA journal_mode = WAL');
    initializeSchema(db);
    return db;
  } catch {
    try {
      db?.close();
    } catch {}
    return null;
  }
}

/** Deletes a corrupt database and opens it once more, or null when that fails. */
function recreateDatabase(dbPath: string, DatabaseSync: DatabaseConstructor): Database | null {
  removeDatabase(dbPath);
  return openDatabase(dbPath, DatabaseSync);
}

/** Builds the failure-tolerant `StreamIndex` over an open connection. */
function createIndex(db: Database, archiveRoot: string): StreamIndex {
  const lookedUp = new Set<string>();
  const lookupStmt = db.prepare('SELECT size, mtime_ms, events_json FROM streams WHERE path = ?');
  const storeStmt = db.prepare(
    'INSERT INTO streams (path, size, mtime_ms, events_json) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(path) DO UPDATE SET size = excluded.size, ' +
      'mtime_ms = excluded.mtime_ms, events_json = excluded.events_json',
  );
  const pathsStmt = db.prepare('SELECT path FROM streams');
  const deleteStmt = db.prepare('DELETE FROM streams WHERE path = ?');

  return {
    covers(filePath: string): boolean {
      const relative = path.relative(archiveRoot, path.resolve(filePath));
      return (
        relative === '' ||
        (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
      );
    },
    lookup(filePath: string, size: number, mtimeMs: number): string | null {
      const resolved = path.resolve(filePath);
      lookedUp.add(resolved);
      try {
        const row = lookupStmt.get(resolved);
        if (!row || row.size !== size || row.mtime_ms !== mtimeMs) return null;
        return typeof row.events_json === 'string' ? row.events_json : null;
      } catch {
        return null;
      }
    },
    store(filePath: string, size: number, mtimeMs: number, eventsJson: string): void {
      try {
        storeStmt.run(path.resolve(filePath), size, mtimeMs, eventsJson);
      } catch {}
    },
    close(): void {
      try {
        for (const row of pathsStmt.all()) {
          const filePath = String(row.path);
          if (!lookedUp.has(filePath) && !fs.existsSync(filePath)) deleteStmt.run(filePath);
        }
      } catch {}
      try {
        db.close();
      } catch {}
    },
  };
}

/**
 * Opens the derived index under `<projectRoot>/.osq/`, covering `archiveDir`.
 * Resolves to null when `node:sqlite` is unavailable or the index cannot be
 * opened and recreated; callers then read the files as today.
 */
export async function openStreamIndex(
  projectRoot: string,
  archiveDir: string,
): Promise<StreamIndex | null> {
  let DatabaseSync: DatabaseConstructor;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    return null;
  }

  let dbPath: string;
  try {
    dbPath = prepareDirectory(projectRoot);
  } catch {
    return null;
  }

  const db = openDatabase(dbPath, DatabaseSync) ?? recreateDatabase(dbPath, DatabaseSync);
  if (!db) return null;
  try {
    return createIndex(db, path.resolve(archiveDir));
  } catch {
    try {
      db.close();
    } catch {}
    return null;
  }
}
