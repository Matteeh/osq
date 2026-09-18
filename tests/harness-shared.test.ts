import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EventStreamParser,
  asRecord,
  firstNonEmptyString,
  resolveEventTimestamp,
} from '../src/harness/stream.js';

describe('shared harness stream helpers', () => {
  describe('asRecord', () => {
    it('returns a plain object unchanged', () => {
      const value = { a: 1, b: 'two' };
      assert.equal(asRecord(value), value);
    });

    it('returns undefined for arrays, null, undefined, and primitives', () => {
      assert.equal(asRecord([]), undefined);
      assert.equal(asRecord([{ a: 1 }]), undefined);
      assert.equal(asRecord(null), undefined);
      assert.equal(asRecord(undefined), undefined);
      assert.equal(asRecord('string'), undefined);
      assert.equal(asRecord(42), undefined);
      assert.equal(asRecord(true), undefined);
    });
  });

  describe('firstNonEmptyString', () => {
    it('returns the first non-empty string and skips empty or non-string values', () => {
      assert.equal(firstNonEmptyString(undefined, null, '', 7, {}, 'found', 'later'), 'found');
    });

    it('returns undefined when no candidate is a non-empty string', () => {
      assert.equal(firstNonEmptyString(undefined, null, '', 0, false, {}), undefined);
    });
  });

  describe('resolveEventTimestamp', () => {
    it('normalizes string timestamps to ISO form', () => {
      assert.equal(
        resolveEventTimestamp({ timestamp: '2026-09-17T12:00:00.000Z' }),
        '2026-09-17T12:00:00.000Z',
      );
    });

    it('normalizes numeric epoch timestamps to ISO form', () => {
      assert.equal(
        resolveEventTimestamp({ timestamp: 1789673166622 }),
        new Date(1789673166622).toISOString(),
      );
    });

    it('falls back to a nested step_update timestamp', () => {
      assert.equal(
        resolveEventTimestamp({ step_update: { timestamp: '2026-09-17T01:02:03.000Z' } }),
        '2026-09-17T01:02:03.000Z',
      );
    });

    it('returns the current time for missing or invalid timestamps', () => {
      const before = Date.now();
      const resolved = resolveEventTimestamp({ timestamp: 'not-a-date' });
      const parsed = Date.parse(resolved);
      assert.ok(!Number.isNaN(parsed));
      assert.ok(parsed >= before - 1000 && parsed <= Date.now() + 1000);

      const missing = resolveEventTimestamp({});
      assert.ok(!Number.isNaN(Date.parse(missing)));
    });
  });

  describe('EventStreamParser', () => {
    it('reassembles lines split across chunks and flushes the trailing partial line', async () => {
      const lines: string[] = [];
      const parser = new EventStreamParser(async (line) => {
        lines.push(line);
      });

      parser.feed('{"a":1}\n{"b"');
      parser.feed(':2}\n{"c":3}\n{"d":4}');
      await parser.flush();

      assert.deepEqual(lines, ['{"a":1}', '{"b":2}', '{"c":3}', '{"d":4}']);
    });

    it('skips empty and whitespace-only lines', async () => {
      const lines: string[] = [];
      const parser = new EventStreamParser(async (line) => {
        lines.push(line);
      });

      parser.feed('\n\n   \n');
      parser.feed('real line\n   \n');
      await parser.flush();

      assert.deepEqual(lines, ['real line']);
    });

    it('awaits handlers serially in arrival order', async () => {
      const lines: string[] = [];
      const parser = new EventStreamParser(async (line) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        lines.push(line);
      });

      parser.feed('one\ntwo\nthree\n');
      await parser.flush();

      assert.deepEqual(lines, ['one', 'two', 'three']);
    });

    it('continues after a handler rejects and still resolves flush', async () => {
      const lines: string[] = [];
      let calls = 0;
      const parser = new EventStreamParser(async (line) => {
        calls++;
        if (line === 'boom') {
          throw new Error('handler failure');
        }
        lines.push(line);
      });

      parser.feed('before\nboom\nafter\n');
      await assert.doesNotReject(async () => parser.flush());

      assert.equal(calls, 3);
      assert.deepEqual(lines, ['before', 'after']);
    });

    it('flushes an unterminated final line exactly once across repeated feeds', async () => {
      const lines: string[] = [];
      const parser = new EventStreamParser(async (line) => {
        lines.push(line);
      });

      parser.feed('single line');
      await parser.flush();
      await parser.flush();

      assert.deepEqual(lines, ['single line']);
    });
  });
});
