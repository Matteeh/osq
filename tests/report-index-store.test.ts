import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import { type StreamIndex, openStreamIndex } from '../src/core/report/stream-index.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A temporary project with an archive folder. */
async function tempProject(): Promise<{ projectRoot: string; archiveDir: string }> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-index-store-'));
  tmpDirs.push(projectRoot);
  const archiveDir = path.join(projectRoot, 'openspec', 'changes', 'archive');
  await fs.mkdir(archiveDir, { recursive: true });
  return { projectRoot, archiveDir };
}

/** Opens the index in a temporary project and asserts the open succeeded. */
async function indexFor(projectRoot: string, archiveDir: string): Promise<StreamIndex> {
  const index = await openStreamIndex(projectRoot, archiveDir);
  assert.ok(index, 'openStreamIndex resolved to null');
  return index;
}

/** Opens a direct connection to one project's index file. */
function direct(projectRoot: string): DatabaseSync {
  return new DatabaseSync(path.join(projectRoot, '.osq', 'index.sqlite'));
}

describe('openStreamIndex', () => {
  it('resolves to the StreamIndex port', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const index = await indexFor(projectRoot, archiveDir);

    assert.equal(typeof index.covers, 'function');
    assert.equal(typeof index.lookup, 'function');
    assert.equal(typeof index.store, 'function');
    assert.equal(typeof index.close, 'function');
    index.close();
  });

  it('creates the osq folder and gitignore and opens in WAL mode', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const index = await indexFor(projectRoot, archiveDir);
    index.close();

    const gitignore = await fs.readFile(path.join(projectRoot, '.osq', '.gitignore'), 'utf8');
    assert.equal(gitignore.trim(), '*');

    const db = direct(projectRoot);
    const mode = db.prepare('PRAGMA journal_mode').get();
    db.close();
    assert.equal(String(mode?.journal_mode).toLowerCase(), 'wal');
  });

  it('keeps a schema version and the stream columns', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const index = await indexFor(projectRoot, archiveDir);
    index.close();

    const db = direct(projectRoot);
    const meta = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
    const columns = db
      .prepare('PRAGMA table_info(streams)')
      .all()
      .map((row) => String(row.name))
      .sort();
    db.close();

    assert.equal(typeof meta?.value, 'string');
    assert.deepEqual(columns, ['events_json', 'mtime_ms', 'path', 'size']);
  });

  it('empties and rebuilds an index with another schema version', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const file = path.join(archiveDir, 'change.jsonl');
    await fs.writeFile(file, '{}\n');

    const first = await indexFor(projectRoot, archiveDir);
    first.store(file, 3, 1, '[{"type":"started"}]');
    first.close();

    const db = direct(projectRoot);
    db.prepare('UPDATE meta SET value = ? WHERE key = ?').run('999', 'schema_version');
    db.close();

    const second = await indexFor(projectRoot, archiveDir);
    assert.equal(second.lookup(file, 3, 1), null);
    second.close();
  });

  it('replaces a file that is not a SQLite database', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const dbPath = path.join(projectRoot, '.osq', 'index.sqlite');
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    await fs.writeFile(dbPath, 'this is not a SQLite database');
    await fs.writeFile(`${dbPath}-wal`, 'stale');
    await fs.writeFile(`${dbPath}-shm`, 'stale');

    const index = await indexFor(projectRoot, archiveDir);
    assert.equal(index.lookup(path.join(archiveDir, 'x.jsonl'), 1, 1), null);
    index.close();

    const db = direct(projectRoot);
    const meta = db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
    db.close();
    assert.equal(typeof meta?.value, 'string');
  });

  it('resolves to null when the index cannot be created', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    await fs.mkdir(path.join(projectRoot, '.osq', 'index.sqlite'), { recursive: true });

    assert.equal(await openStreamIndex(projectRoot, archiveDir), null);
  });
});

describe('covers', () => {
  it('is true only under the archive folder', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const index = await indexFor(projectRoot, archiveDir);

    assert.equal(index.covers(path.join(archiveDir, '001-x', 'change.jsonl')), true);
    assert.equal(index.covers(archiveDir), true);
    assert.equal(
      index.covers(path.join(projectRoot, 'openspec', 'changes', 'active', 'a.jsonl')),
      false,
    );
    assert.equal(index.covers(`${archiveDir}-suffix/a.jsonl`), false);
    index.close();
  });
});

describe('lookup and store', () => {
  it('matches only on path, size and modification time', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const file = path.join(archiveDir, 'change.jsonl');
    const other = path.join(archiveDir, 'other.jsonl');
    const index = await indexFor(projectRoot, archiveDir);
    index.store(file, 100, 1234.5, '[{"type":"started"}]');

    assert.equal(index.lookup(file, 100, 1234.5), '[{"type":"started"}]');
    assert.equal(index.lookup(file, 101, 1234.5), null);
    assert.equal(index.lookup(file, 100, 1234.6), null);
    assert.equal(index.lookup(other, 100, 1234.5), null);
    index.close();
  });

  it('replaces the row for a path', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const file = path.join(archiveDir, 'change.jsonl');
    const index = await indexFor(projectRoot, archiveDir);

    index.store(file, 1, 1, '[{"type":"a"}]');
    index.store(file, 2, 2, '[{"type":"b"}]');

    assert.equal(index.lookup(file, 2, 2), '[{"type":"b"}]');
    assert.equal(index.lookup(file, 1, 1), null);
    index.close();
  });
});

describe('close', () => {
  it('drops a stale row the session never looked up', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const file = path.join(archiveDir, 'gone.jsonl');
    await fs.writeFile(file, '{}\n');

    const first = await indexFor(projectRoot, archiveDir);
    first.store(file, 3, 1, '[{"type":"started"}]');
    await fs.rm(file);
    first.close();

    const second = await indexFor(projectRoot, archiveDir);
    assert.equal(second.lookup(file, 3, 1), null);
    second.close();
  });

  it('keeps a row for an existing file the session never looked up', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const file = path.join(archiveDir, 'kept.jsonl');
    await fs.writeFile(file, '{}\n');

    const first = await indexFor(projectRoot, archiveDir);
    first.store(file, 3, 1, '[{"type":"started"}]');
    first.close();

    const second = await indexFor(projectRoot, archiveDir);
    assert.equal(second.lookup(file, 3, 1), '[{"type":"started"}]');
    second.close();
  });

  it('keeps a row whose path the session looked up even when the file is gone', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const file = path.join(archiveDir, 'looked.jsonl');
    await fs.writeFile(file, '{}\n');

    const first = await indexFor(projectRoot, archiveDir);
    first.store(file, 3, 1, '[{"type":"started"}]');
    assert.equal(first.lookup(file, 3, 1), '[{"type":"started"}]');
    await fs.rm(file);
    first.close();

    const second = await indexFor(projectRoot, archiveDir);
    assert.equal(second.lookup(file, 3, 1), '[{"type":"started"}]');
    second.close();
  });
});

describe('a locked index', () => {
  it('lets store and close give up silently while lookup still reads', async () => {
    const { projectRoot, archiveDir } = await tempProject();
    const file = path.join(archiveDir, 'change.jsonl');
    await fs.writeFile(file, '{}\n');

    const index = await indexFor(projectRoot, archiveDir);
    index.store(file, 3, 1, '[{"type":"started"}]');

    const lock = direct(projectRoot);
    lock.exec('BEGIN IMMEDIATE');
    try {
      const started = Date.now();
      assert.doesNotThrow(() => index.store(file, 3, 1, '[{"type":"changed"}]'));
      assert.ok(Date.now() - started < 1000, 'store waited on the busy timeout');
      assert.equal(index.lookup(file, 3, 1), '[{"type":"started"}]');
      assert.doesNotThrow(() => index.close());
    } finally {
      lock.exec('COMMIT');
      lock.close();
    }

    const reopened = await indexFor(projectRoot, archiveDir);
    assert.equal(reopened.lookup(file, 3, 1), '[{"type":"started"}]');
    reopened.close();
  });
});
