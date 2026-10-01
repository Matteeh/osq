import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { readBriefData, readManifestObject } from '../src/core/report/change-reads.js';
import {
  freezeDeep,
  readSharedFile,
  readTextFile,
  withStreamReads,
} from '../src/core/report/stream-reads.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  mock.restoreAll();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-shared-reads-'));
  tmpDirs.push(dir);
  return dir;
}

async function tempFile(name: string, content: string): Promise<string> {
  const dir = await tempDir();
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
}

/** Counts reads of the default `node:fs/promises` export while delegating to it. */
function countReads(): () => number {
  const original = fs.readFile.bind(fs);
  let count = 0;
  mock.method(fs, 'readFile', (...args: unknown[]) => {
    count++;
    return (original as (...rest: unknown[]) => Promise<unknown>)(...args);
  });
  return () => count;
}

describe('readSharedFile', () => {
  it('reads once and shares one parsed value inside a scope', async () => {
    const filePath = await tempFile('data.txt', 'hello');
    const reads = countReads();
    const parse = (content: string): { content: string } => ({ content });

    const [first, second] = await withStreamReads(() =>
      Promise.all([readSharedFile(filePath, parse), readSharedFile(filePath, parse)]),
    );

    assert.equal(reads(), 1);
    assert.strictEqual(first, second);
  });

  it('shares one read for calls that start before the first finishes', async () => {
    const filePath = await tempFile('slow.txt', 'hello');
    const reads = countReads();
    const parse = (content: string): string => content;

    const [first, second] = await withStreamReads(() => {
      const a = readSharedFile(filePath, parse);
      const b = readSharedFile(filePath, parse);
      return Promise.all([a, b]);
    });

    assert.equal(first, second);
    assert.equal(reads(), 1);
  });

  it('reuses the outer scope for a nested call', async () => {
    const filePath = await tempFile('nested.txt', 'hello');
    const reads = countReads();
    const parse = (content: string): number => content.length;

    const [outer, inner] = await withStreamReads(async () => {
      const a = readSharedFile(filePath, parse);
      const b = await withStreamReads(() => readSharedFile(filePath, parse));
      return Promise.all([a, b]);
    });

    assert.equal(outer, 5);
    assert.strictEqual(outer, inner);
    assert.equal(reads(), 1);
  });

  it('reads from disk on every call outside a scope', async () => {
    const filePath = await tempFile('outside.txt', 'hello');
    const reads = countReads();
    const parse = (content: string): { content: string } => ({ content });

    const first = await readSharedFile(filePath, parse);
    const second = await readSharedFile(filePath, parse);

    assert.equal(reads(), 2);
    assert.notStrictEqual(first, second);
  });

  it('shares nothing between two scopes', async () => {
    const filePath = await tempFile('separate.txt', 'hello');
    const reads = countReads();
    const parse = (content: string): { content: string } => ({ content });

    const first = await withStreamReads(() => readSharedFile(filePath, parse));
    const second = await withStreamReads(() => readSharedFile(filePath, parse));

    assert.equal(reads(), 2);
    assert.notStrictEqual(first, second);
  });

  it('rejects with the file-system error inside and outside a scope', async () => {
    const dir = await tempDir();
    const missing = path.join(dir, 'missing.txt');
    const parse = (content: string): string => content;

    await assert.rejects(readSharedFile(missing, parse), { code: 'ENOENT' });
    await assert.rejects(
      withStreamReads(() => readSharedFile(missing, parse)),
      { code: 'ENOENT' },
    );
    await assert.rejects(
      withStreamReads(() => readSharedFile(dir, parse)),
      { code: 'EISDIR' },
    );
  });

  it('does not retry a failed read inside a scope', async () => {
    const dir = await tempDir();
    const missing = path.join(dir, 'missing.txt');
    const parse = (content: string): string => content;
    const reads = countReads();

    await withStreamReads(async () => {
      await assert.rejects(readSharedFile(missing, parse), { code: 'ENOENT' });
      await assert.rejects(readSharedFile(missing, parse), { code: 'ENOENT' });
    });

    assert.equal(reads(), 1);
  });

  it('raises no unhandled rejection for a cached failed read', async () => {
    const dir = await tempDir();
    const missing = path.join(dir, 'missing.txt');
    const parse = (content: string): string => content;
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown): void => {
      rejections.push(reason);
    };
    process.on('unhandledRejection', onRejection);

    try {
      await withStreamReads(() =>
        Promise.allSettled([readSharedFile(missing, parse), readSharedFile(missing, parse)]),
      );
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', onRejection);
    }

    assert.equal(rejections.length, 0);
  });

  it('rejects when the parser throws, inside and outside a scope', async () => {
    const filePath = await tempFile('throw.txt', 'hello');
    const boom = (): never => {
      throw new Error('boom');
    };

    await assert.rejects(readSharedFile(filePath, boom), /boom/);
    await assert.rejects(
      withStreamReads(() => readSharedFile(filePath, boom)),
      /boom/,
    );
  });
});

describe('readTextFile', () => {
  it('reads once per path inside a scope and returns the text', async () => {
    const filePath = await tempFile('text.txt', 'hello');
    const reads = countReads();

    const [first, second] = await withStreamReads(() =>
      Promise.all([readTextFile(filePath), readTextFile(filePath)]),
    );

    assert.equal(first, 'hello');
    assert.equal(second, 'hello');
    assert.equal(reads(), 1);
  });

  it('rejects with the file-system error outside a scope', async () => {
    const dir = await tempDir();
    await assert.rejects(readTextFile(path.join(dir, 'missing.txt')), { code: 'ENOENT' });
  });
});

describe('freezeDeep', () => {
  it('freezes the value and every object and array inside it', () => {
    const value = { a: { b: 1 }, list: [{ c: 2 }] };
    const frozen = freezeDeep(value);

    assert.strictEqual(frozen, value);
    assert.ok(Object.isFrozen(value));
    assert.ok(Object.isFrozen(value.a));
    assert.ok(Object.isFrozen(value.list));
    assert.ok(Object.isFrozen(value.list[0]));
  });

  it('returns a primitive unchanged', () => {
    assert.equal(freezeDeep(42), 42);
    assert.equal(freezeDeep('x'), 'x');
    assert.equal(freezeDeep(null), null);
  });

  it('leaves an already frozen value alone', () => {
    const inner = Object.freeze({ b: 1 });
    const value = { a: inner };

    assert.strictEqual(freezeDeep(value).a, inner);
    assert.ok(Object.isFrozen(inner));
  });
});

describe('readBriefData', () => {
  it('returns the brief frontmatter data, frozen', async () => {
    const dir = await tempDir();
    await fs.writeFile(
      path.join(dir, 'brief.md'),
      '---\ntitle: Hello\nqueue: item-1\n---\nbody\n',
      'utf8',
    );

    const data = await readBriefData(dir);
    assert.ok(data);
    assert.equal(data.title, 'Hello');
    assert.equal(data.queue, 'item-1');
    assert.ok(Object.isFrozen(data));
  });

  it('returns null for a missing brief', async () => {
    const dir = await tempDir();
    assert.equal(await readBriefData(dir), null);
  });

  it('reads each brief once per scope for every caller', async () => {
    const dir = await tempDir();
    await fs.writeFile(path.join(dir, 'brief.md'), '---\ntitle: Hello\n---\n', 'utf8');
    const reads = countReads();

    await withStreamReads(() => Promise.all([readBriefData(dir), readBriefData(dir)]));

    assert.equal(reads(), 1);
  });
});

describe('readManifestObject', () => {
  it('returns the manifest parsed as a frozen object', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, '.run'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.run', 'manifest.json'),
      '{"approvedAt":"2026-01-01T00:00:00.000Z"}',
      'utf8',
    );

    const manifest = await readManifestObject(dir);
    assert.ok(manifest);
    assert.equal(manifest.approvedAt, '2026-01-01T00:00:00.000Z');
    assert.ok(Object.isFrozen(manifest));
  });

  it('returns null for a missing manifest', async () => {
    const dir = await tempDir();
    assert.equal(await readManifestObject(dir), null);
  });

  it('returns null for a malformed manifest', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, '.run'), { recursive: true });
    await fs.writeFile(path.join(dir, '.run', 'manifest.json'), '{not json', 'utf8');
    assert.equal(await readManifestObject(dir), null);
  });

  it('returns null when the manifest is not a plain object', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, '.run'), { recursive: true });
    await fs.writeFile(path.join(dir, '.run', 'manifest.json'), '[1,2,3]', 'utf8');
    assert.equal(await readManifestObject(dir), null);
  });

  it('reads each manifest once per scope for every caller', async () => {
    const dir = await tempDir();
    await fs.mkdir(path.join(dir, '.run'), { recursive: true });
    await fs.writeFile(path.join(dir, '.run', 'manifest.json'), '{"a":1}', 'utf8');
    const reads = countReads();

    await withStreamReads(() => Promise.all([readManifestObject(dir), readManifestObject(dir)]));

    assert.equal(reads(), 1);
  });
});
