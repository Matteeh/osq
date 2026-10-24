import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, it } from 'node:test';
import { type BlobLineIndex, openBlobLineIndex } from '../src/core/report/blob-line-index.js';
import { openStreamIndex } from '../src/core/report/stream-index.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

/** A temporary project root. */
async function tempProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-blob-lines-'));
  tmpDirs.push(root);
  return root;
}

/** Opens the blob line index and asserts the open succeeded. */
async function indexFor(root: string): Promise<BlobLineIndex> {
  const index = await openBlobLineIndex(root);
  assert.ok(index, 'openBlobLineIndex resolved to null');
  return index;
}

type Answer = number | null | undefined;

/** Stores two blobs, reopens the index, and looks up all three table blobs. */
async function storedAnswers(root: string): Promise<Record<'aaa' | 'bbb' | 'ccc', Answer>> {
  const first = await indexFor(root);
  first.store([
    { blob: 'aaa', lines: 3 },
    { blob: 'bbb', lines: null },
  ]);
  first.close();

  const second = await indexFor(root);
  const answers = {
    aaa: second.lookup('aaa'),
    bbb: second.lookup('bbb'),
    ccc: second.lookup('ccc'),
  };
  second.close();
  return answers;
}

interface StreamsBesideBlobs {
  readonly found: string | null;
  readonly before: string | undefined;
  readonly after: string | undefined;
  readonly blobAnswer: Answer;
}

/** Reads one meta value through a direct connection. */
function metaValue(root: string, key: string): string | undefined {
  const db = new DatabaseSync(path.join(root, '.osq', 'index.sqlite'));
  try {
    const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return typeof row?.value === 'string' ? row.value : undefined;
  } finally {
    db.close();
  }
}

/** Writes a streams row, then stores a blob and reopens the stream index. */
async function blobsBesideStreams(root: string): Promise<StreamsBesideBlobs> {
  const archiveDir = path.join(root, 'openspec', 'changes', 'archive');
  await fs.mkdir(archiveDir, { recursive: true });
  const file = path.join(archiveDir, 'change.jsonl');
  await fs.writeFile(file, '{}\n');

  const streams = await openStreamIndex(root, archiveDir);
  assert.ok(streams, 'openStreamIndex resolved to null');
  streams.store(file, 3, 1, '[{"type":"started"}]');
  streams.close();

  const before = metaValue(root, 'schema_version');
  const blobs = await indexFor(root);
  blobs.store([{ blob: 'aaa', lines: 3 }]);
  const blobAnswer = blobs.lookup('aaa');
  blobs.close();
  const after = metaValue(root, 'schema_version');

  const reopened = await openStreamIndex(root, archiveDir);
  assert.ok(reopened, 'openStreamIndex resolved to null after a blob store');
  const found = reopened.lookup(file, 3, 1);
  reopened.close();

  return { found, before, after, blobAnswer };
}

describe('blob line index', () => {
  it('Stored blob line counts', async () => {
    const root = await tempProject();
    const answers = await storedAnswers(root);
    const table: [keyof typeof answers, Answer][] = [
      ['aaa', 3],
      ['bbb', null],
      ['ccc', undefined],
    ];
    for (const [blob, expected] of table) assert.equal(answers[blob], expected);

    const index = await indexFor(root);
    index.store([{ blob: 'aaa', lines: 9 }]);
    assert.equal(index.lookup('aaa'), 9);
    index.close();
  });

  it("Blob lines beside the report's streams", async () => {
    const root = await tempProject();
    const result = await blobsBesideStreams(root);

    assert.equal(result.found, '[{"type":"started"}]');
    assert.equal(typeof result.before, 'string');
    assert.equal(result.after, result.before);
    assert.equal(result.blobAnswer, 3);
  });

  it('Blob line index that cannot open', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, '.osq'), 'not a folder');

    assert.equal(await openBlobLineIndex(root), null);
  });
});
