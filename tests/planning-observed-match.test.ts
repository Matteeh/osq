import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  findPlanningSessions,
  isSegmentContained,
  normalizeObservedTarget,
  observedSessionId,
} from '../src/core/report/planning-observed.js';
import { candidate } from './planning-observed-helpers.js';

describe('path containment', () => {
  it('accepts nested targets and rejects sibling prefixes and escapes', () => {
    assert.equal(isSegmentContained('/a/001-x', '/a/001-x/tasks/1.md'), true);
    assert.equal(isSegmentContained('/a/001-x', '/a/001-x'), false);
    assert.equal(isSegmentContained('/a/001-x', '/a/001-xy/tasks/1.md'), false);
    assert.equal(isSegmentContained('/a/001-x', '/a/tasks/1.md'), false);
  });

  it('resolves relative targets from the session directory', () => {
    assert.equal(
      normalizeObservedTarget('tasks/1.md', '/a/001-x', '/a/001-x'),
      path.resolve('/a/001-x/tasks/1.md'),
    );
    assert.equal(
      normalizeObservedTarget('/a/001-x/tasks/1.md', null, '/a/001-x'),
      path.resolve('/a/001-x/tasks/1.md'),
    );
    assert.equal(normalizeObservedTarget('../001-xy/x.md', '/a/001-x', '/a/001-x'), null);
    assert.equal(normalizeObservedTarget('../../etc/passwd', '/a/001-x', '/a/001-x'), null);
    assert.equal(normalizeObservedTarget('tasks/1.md', null, '/a/001-x'), null);
  });
});

describe('findPlanningSessions', () => {
  const created = '2026-01-01T00:00:00.000Z';
  const observed = '2026-01-01T00:01:00.000Z';
  let changeFolder = '';

  beforeEach(async () => {
    changeFolder = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-find-observed-'));
  });
  afterEach(async () => {
    if (changeFolder) await fs.rm(changeFolder, { recursive: true, force: true });
  });

  it('matches inclusive window boundaries and the segment-contained folder', async () => {
    const readings = [
      candidate({ sessionDir: changeFolder, edits: [{ path: 'tasks/1.md', timestamp: created }] }),
      candidate({
        sessionDir: changeFolder,
        nativeSessionId: 'native-2',
        edits: [{ path: 'tasks/2.md', timestamp: observed }],
      }),
      candidate({
        sessionDir: changeFolder,
        nativeSessionId: 'native-3',
        edits: [{ path: 'tasks/3.md', timestamp: '2025-12-31T23:59:59.000Z' }],
      }),
      candidate({
        sessionDir: changeFolder,
        nativeSessionId: 'native-4',
        edits: [{ path: 'tasks/4.md', timestamp: '2026-01-01T00:01:00.001Z' }],
      }),
    ];
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [() => Promise.resolve(readings)],
    });
    assert.deepEqual(
      matches.map((match) => match.nativeSessionId),
      ['native-1', 'native-2'],
    );
  });

  it('rejects sibling prefixes, escapes, and out-of-folder edits', async () => {
    const sibling = `${changeFolder}-x`;
    const readings = [
      candidate({
        nativeSessionId: 'sib',
        sessionDir: changeFolder,
        edits: [
          { path: `../${path.basename(sibling)}/f.md`, timestamp: '2026-01-01T00:00:30.000Z' },
        ],
      }),
      candidate({
        nativeSessionId: 'esc',
        sessionDir: changeFolder,
        edits: [{ path: '../../outside/f.md', timestamp: '2026-01-01T00:00:30.000Z' }],
      }),
      candidate({
        nativeSessionId: 'inside',
        sessionDir: changeFolder,
        edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:30.000Z' }],
      }),
    ];
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [() => Promise.resolve(readings)],
    });
    assert.deepEqual(
      matches.map((match) => match.nativeSessionId),
      ['inside'],
    );
  });

  it('deduplicates by harness and native id and orders deterministically', async () => {
    const readerA = () =>
      Promise.resolve([
        candidate({
          harness: 'opencode',
          sessionDir: changeFolder,
          nativeSessionId: 'z',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:10.000Z' }],
        }),
        candidate({
          harness: 'codex',
          sessionDir: changeFolder,
          nativeSessionId: 'b',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:20.000Z' }],
        }),
      ]);
    const readerB = () =>
      Promise.resolve([
        candidate({
          harness: 'codex',
          sessionDir: changeFolder,
          nativeSessionId: 'b',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:20.000Z' }],
        }),
        candidate({
          harness: 'claude',
          sessionDir: changeFolder,
          nativeSessionId: 'a',
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:05.000Z' }],
        }),
      ]);
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [readerA, readerB],
    });
    assert.deepEqual(
      matches.map((match) => match.sessionId),
      [
        observedSessionId('codex', 'b'),
        observedSessionId('opencode', 'z'),
        observedSessionId('claude', 'a'),
      ],
    );
  });

  it('isolates reader failures and invalid windows', async () => {
    const throwing = () => Promise.reject(new Error('boom'));
    const good = () =>
      Promise.resolve([
        candidate({
          sessionDir: changeFolder,
          edits: [{ path: 'tasks/1.md', timestamp: '2026-01-01T00:00:30.000Z' }],
        }),
      ]);
    const matches = await findPlanningSessions(changeFolder, {
      createdAt: created,
      observedAt: observed,
      readers: [throwing, good],
    });
    assert.equal(matches.length, 1);

    assert.deepEqual(
      await findPlanningSessions(changeFolder, {
        createdAt: null,
        observedAt: observed,
        readers: [good],
      }),
      [],
    );
    assert.deepEqual(
      await findPlanningSessions(changeFolder, {
        createdAt: created,
        observedAt: '2025-12-31T23:59:59.000Z',
        readers: [good],
      }),
      [],
    );
  });
});
