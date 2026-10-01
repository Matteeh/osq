import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, mock } from 'node:test';
import { parseEventLines } from '../src/core/report/report-events.js';
import {
  readEventStream,
  readParsedFile,
  withStreamReads,
} from '../src/core/report/stream-reads.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  mock.restoreAll();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function tempFile(name: string, content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stream-reads-'));
  tmpDirs.push(dir);
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

/** The typed `data` object of one event the reader returned. */
function dataOf(event: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return event.data as Record<string, unknown>;
}

const LOG_STREAM = `${[
  '{"type":"verify_ran","timestamp":"2026-01-01T00:00:00.000Z","data":{"exitCode":0,"durationSeconds":1.5,"output":"full log"}}',
  '{"type":"regressed","timestamp":"2026-01-01T00:00:01.000Z","data":{"reason":"scope","output":"regression log"}}',
  '{"type":"recertification","timestamp":"2026-01-01T00:00:02.000Z","data":{"mode":"auto","output":"recert log"}}',
  '{"type":"tokens","timestamp":"2026-01-01T00:00:03.000Z","data":{"input":1,"output":42}}',
  '{"type":"started","timestamp":"2026-01-01T00:00:04.000Z","data":{"task":"1"}}',
].join('\n')}\n`;

describe('stream reads', () => {
  it('resolves to what its work resolves to', async () => {
    assert.equal(await withStreamReads(async () => 42), 42);
  });

  it('reads once and shares one parsed object inside a scope', async () => {
    const filePath = await tempFile('shared.jsonl', '{"a":1}\n');
    const reads = countReads();
    const parse = (content: string): { content: string } => ({ content });

    const [first, second] = await withStreamReads(async () => {
      const a = readParsedFile(filePath, parse);
      const b = readParsedFile(filePath, parse);
      return Promise.all([a, b]);
    });

    assert.equal(reads(), 1);
    assert.strictEqual(first, second);
  });

  it('reuses the outer scope for a nested call', async () => {
    const filePath = await tempFile('nested.jsonl', '{"a":1}\n');
    const reads = countReads();
    const parse = (content: string): number => content.length;

    const [outer, inner] = await withStreamReads(async () => {
      const a = readParsedFile(filePath, parse);
      const b = await withStreamReads(() => readParsedFile(filePath, parse));
      return Promise.all([a, b]);
    });

    assert.equal(outer, 8);
    assert.strictEqual(outer, inner);
    assert.equal(reads(), 1);
  });

  it('reads from disk on every call outside a scope', async () => {
    const filePath = await tempFile('outside.jsonl', '{"a":1}\n');
    const reads = countReads();
    const parse = (content: string): { content: string } => ({ content });

    const first = await readParsedFile(filePath, parse);
    const second = await readParsedFile(filePath, parse);

    assert.equal(reads(), 2);
    assert.notStrictEqual(first, second);
  });

  it('shares nothing between two withStreamReads calls', async () => {
    const filePath = await tempFile('separate.jsonl', '{"a":1}\n');
    const reads = countReads();
    const parse = (content: string): { content: string } => ({ content });

    const first = await withStreamReads(() => readParsedFile(filePath, parse));
    const second = await withStreamReads(() => readParsedFile(filePath, parse));

    assert.equal(reads(), 2);
    assert.notStrictEqual(first, second);
  });

  it('resolves null for a missing file in and out of a scope', async () => {
    const missing = path.join(os.tmpdir(), `osq-missing-${process.pid}-${Date.now()}.jsonl`);
    const parse = (content: string): string => content;

    assert.equal(await readParsedFile(missing, parse), null);
    assert.equal(await withStreamReads(() => readParsedFile(missing, parse)), null);
  });

  it('resolves null for an unreadable file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stream-reads-'));
    tmpDirs.push(dir);
    const parse = (content: string): string => content;

    assert.equal(await readParsedFile(dir, parse), null);
  });

  it('rejects when the parser throws', async () => {
    const filePath = await tempFile('throw.jsonl', '{"a":1}\n');
    const boom = (): never => {
      throw new Error('boom');
    };

    await assert.rejects(readParsedFile(filePath, boom), /boom/);
    await assert.rejects(
      withStreamReads(() => readParsedFile(filePath, boom)),
      /boom/,
    );
  });
});

describe('readEventStream', () => {
  it('parses lines, drops verify logs, and keeps the file intact', async () => {
    const filePath = await tempFile('logs.jsonl', LOG_STREAM);
    const onDisk = await fs.readFile(filePath, 'utf8');
    const parsed = parseEventLines(LOG_STREAM);

    const events = await readEventStream(filePath);
    assert.ok(events);
    assert.equal(events.length, parsed.length);

    const [verifyRan, regressed, recertification, tokens, started] = events;
    assert.equal(dataOf(verifyRan).output, undefined);
    assert.equal(dataOf(verifyRan).exitCode, 0);
    assert.equal(dataOf(verifyRan).durationSeconds, 1.5);
    assert.equal(verifyRan.timestamp, parsed[0].timestamp);

    assert.equal(dataOf(regressed).output, undefined);
    assert.deepEqual(dataOf(regressed), { reason: 'scope' });
    assert.equal(dataOf(recertification).output, undefined);
    assert.deepEqual(dataOf(recertification), { mode: 'auto' });

    assert.equal(dataOf(tokens).output, 42);
    assert.equal(dataOf(started).task, '1');
    assert.deepEqual(started.data, parsed[4].data);

    assert.equal(await fs.readFile(filePath, 'utf8'), onDisk);
    assert.ok(onDisk.includes('full log'));
    assert.ok(onDisk.includes('regression log'));
    assert.ok(onDisk.includes('recert log'));
  });

  it('freezes each event and its data', async () => {
    const filePath = await tempFile('frozen.jsonl', LOG_STREAM);
    const events = await readEventStream(filePath);
    assert.ok(events);

    const event = events[0] as unknown as Record<string, unknown>;
    assert.throws(() => {
      event.type = 'changed';
    }, TypeError);
    const data = event.data as Record<string, unknown>;
    assert.throws(() => {
      data.exitCode = 1;
    }, TypeError);
    assert.throws(() => {
      data.added = true;
    }, TypeError);
  });

  it('resolves null for a missing file', async () => {
    const missing = path.join(os.tmpdir(), `osq-missing-${process.pid}-${Date.now()}.jsonl`);
    assert.equal(await readEventStream(missing), null);
  });
});
