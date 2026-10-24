/** Derived SQLite cache of line counts keyed by git blob hash. Never a source of truth. */

import { openIndexDatabase } from './stream-index.js';

/** A git blob hash and its line count, or null when the blob is not text. */
export interface BlobLineEntry {
  readonly blob: string;
  readonly lines: number | null;
}

/** The blob line cache; every method tolerates failure. */
export interface BlobLineIndex {
  /** The stored count, null for a blob stored as not text, or undefined when absent. */
  lookup(blob: string): number | null | undefined;
  /** Replaces every given blob's row in one transaction. */
  store(entries: readonly BlobLineEntry[]): void;
  /** Closes the connection, ignoring any failure. */
  close(): void;
}

/** A `node:sqlite` connection. */
type Database = import('node:sqlite').DatabaseSync;

/** The table keeps one nullable line count per exact blob hash. */
const BLOB_LINES_TABLE = `CREATE TABLE IF NOT EXISTS blob_lines (
  blob TEXT PRIMARY KEY,
  lines INTEGER
)`;

/** Builds the failure-tolerant `BlobLineIndex` over an open connection. */
function createIndex(db: Database): BlobLineIndex {
  const lookupStmt = db.prepare('SELECT lines FROM blob_lines WHERE blob = ?');
  const storeStmt = db.prepare(
    'INSERT INTO blob_lines (blob, lines) VALUES (?, ?) ' +
      'ON CONFLICT(blob) DO UPDATE SET lines = excluded.lines',
  );

  return {
    lookup(blob: string): number | null | undefined {
      try {
        const row = lookupStmt.get(blob);
        if (!row) return undefined;
        return typeof row.lines === 'number' ? row.lines : null;
      } catch {
        return undefined;
      }
    },
    store(entries: readonly BlobLineEntry[]): void {
      try {
        db.exec('BEGIN');
        try {
          for (const entry of entries) storeStmt.run(entry.blob, entry.lines);
          db.exec('COMMIT');
        } catch {
          try {
            db.exec('ROLLBACK');
          } catch {}
        }
      } catch {}
    },
    close(): void {
      try {
        db.close();
      } catch {}
    },
  };
}

/**
 * Opens the blob line cache in the shared index at
 * `<projectRoot>/.osq/index.sqlite`, or null when that index cannot open.
 *
 * @scenario metrics-and-reporting: Stored blob line counts
 * @scenario metrics-and-reporting: Blob lines beside the report's streams
 * @scenario metrics-and-reporting: Blob line index that cannot open
 * @adr 008
 */
export async function openBlobLineIndex(projectRoot: string): Promise<BlobLineIndex | null> {
  const db = await openIndexDatabase(projectRoot);
  if (!db) return null;
  try {
    db.exec(BLOB_LINES_TABLE);
    return createIndex(db);
  } catch {
    try {
      db.close();
    } catch {}
    return null;
  }
}
