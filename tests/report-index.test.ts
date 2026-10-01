import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { getMetricsReport } from '../src/core/report/report.js';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FIXTURE_ARCHIVE = path.join(ROOT, 'fixture', 'report', 'specs', 'archive');

const tmpDirs: string[] = [];

afterEach(async () => {
  mock.restoreAll();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

interface TempProject {
  readonly root: string;
  readonly home: string;
  readonly archive: string;
}

/**
 * Copies the archived report fixture into a temporary project laid out under
 * `openspec/changes/archive`, with a fresh empty home beside it.
 */
async function tempProject(): Promise<TempProject> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-index-'));
  tmpDirs.push(dir);
  const root = path.join(dir, 'project');
  const home = path.join(dir, 'home');
  const archive = path.join(root, 'openspec', 'changes', 'archive');
  await fs.mkdir(archive, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  await fs.cp(FIXTURE_ARCHIVE, archive, { recursive: true });
  return { root, home, archive };
}

/** The report read from files only, with no index. */
function reportWithoutIndex(root: string, home: string) {
  return getMetricsReport(root, DEFAULT_CONFIG, { home });
}

/** The report read through the derived index. */
function reportWithIndex(root: string, home: string) {
  return getMetricsReport(root, DEFAULT_CONFIG, { home, index: true });
}

/** The index path inside a temporary project. */
function indexPath(root: string): string {
  return path.join(root, '.osq', 'index.sqlite');
}

/** Counts `fs.readFile` calls for archived event streams while delegating. */
function countArchivedEventReads(): Map<string, number> {
  const reads = new Map<string, number>();
  const original = fs.readFile.bind(fs);
  const marker = `${path.sep}.run${path.sep}events${path.sep}`;
  mock.method(fs, 'readFile', (...args: unknown[]) => {
    const filePath = String(args[0]);
    if (filePath.endsWith('.jsonl') && filePath.includes(marker)) {
      reads.set(filePath, (reads.get(filePath) ?? 0) + 1);
    }
    return (original as (...rest: unknown[]) => Promise<unknown>)(...args);
  });
  return reads;
}

/** Reads the stored schema version from an index file, proving it is valid. */
function schemaVersion(dbFile: string): string | undefined {
  const db = new DatabaseSync(dbFile);
  try {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
    return typeof row?.value === 'string' ? row.value : undefined;
  } finally {
    db.close();
  }
}

describe('report reads archived streams from the index', () => {
  it('a cold and a warm index give the report without one', async () => {
    const { root, home } = await tempProject();
    const expected = await reportWithoutIndex(root, home);

    const cold = await reportWithIndex(root, home);
    assert.deepEqual(cold, expected);
    assert.equal(typeof schemaVersion(indexPath(root)), 'string');

    const warm = await reportWithIndex(root, home);
    assert.deepEqual(warm, expected);
  });

  it('a warm run reads no archived event stream', async () => {
    const { root, home } = await tempProject();
    await reportWithIndex(root, home);

    const reads = countArchivedEventReads();
    await reportWithIndex(root, home);

    assert.deepEqual([...reads], [], `warm run read event streams: ${JSON.stringify([...reads])}`);
  });

  it('a deleted index changes nothing and is rewritten', async () => {
    const { root, home } = await tempProject();
    await reportWithIndex(root, home);
    await fs.rm(indexPath(root), { force: true });

    const actual = await reportWithIndex(root, home);
    assert.deepEqual(actual, await reportWithoutIndex(root, home));
    assert.equal(typeof schemaVersion(indexPath(root)), 'string');
  });

  it('a corrupt index changes nothing and is replaced', async () => {
    const { root, home } = await tempProject();
    await fs.mkdir(path.dirname(indexPath(root)), { recursive: true });
    await fs.writeFile(indexPath(root), 'this is not a SQLite database');

    const actual = await reportWithIndex(root, home);
    assert.deepEqual(actual, await reportWithoutIndex(root, home));
    assert.equal(typeof schemaVersion(indexPath(root)), 'string');
  });

  it('a locked index changes nothing and the report succeeds', async () => {
    const { root, home } = await tempProject();
    await reportWithIndex(root, home);

    const lock = new DatabaseSync(indexPath(root));
    lock.exec('BEGIN IMMEDIATE');
    try {
      const actual = await reportWithIndex(root, home);
      assert.deepEqual(actual, await reportWithoutIndex(root, home));
    } finally {
      lock.exec('COMMIT');
      lock.close();
    }
  });

  it('reflects a line appended to an archived change stream', async () => {
    const { root, home, archive } = await tempProject();
    await reportWithIndex(root, home);

    const before = await reportWithoutIndex(root, home);
    const stream = path.join(
      archive,
      '009-watcher-observability',
      '.run',
      'events',
      'change.jsonl',
    );
    const appended = `${JSON.stringify({
      type: 'tokens',
      timestamp: '2026-10-01T00:00:00.000Z',
      data: { input: 100, output: 50 },
    })}\n`;
    await fs.appendFile(stream, appended, 'utf8');

    const expected = await reportWithoutIndex(root, home);
    assert.equal(expected.tokens.total, before.tokens.total + 150);

    const actual = await reportWithIndex(root, home);
    assert.deepEqual(actual, expected);
  });

  it('drops a removed archive folder and changes nothing', async () => {
    const { root, home, archive } = await tempProject();
    await reportWithIndex(root, home);

    await fs.rm(path.join(archive, '009-watcher-observability'), { recursive: true, force: true });

    const actual = await reportWithIndex(root, home);
    assert.deepEqual(actual, await reportWithoutIndex(root, home));

    const db = new DatabaseSync(indexPath(root));
    try {
      const row = db
        .prepare('SELECT COUNT(*) AS count FROM streams WHERE path LIKE ?')
        .get('%009-watcher-observability%');
      assert.equal(row?.count, 0);
    } finally {
      db.close();
    }
  });
});
