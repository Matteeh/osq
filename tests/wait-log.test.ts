import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { DispatchItem } from '../src/core/status/dispatch-items.js';
import {
  type WaitItem,
  type WaitRecord,
  dispatchIdentity,
  firstSeenTimes,
  readWaitLog,
  resolveWaitLogPath,
  waitEpisodes,
} from '../src/core/status/wait-log.js';

let tmpDir: string;
let home: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-wait-log-'));
  home = path.join(tmpDir, 'home');
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function waitItem(kind: WaitItem['kind'], change: string, task: string | null): WaitItem {
  return { kind, change, task };
}

function seen(item: WaitItem, at: string, session: string, unobserved: boolean): WaitRecord {
  return { type: 'seen', item, at, session, idle: false, unobserved };
}

function dispatchItem(item: WaitItem): DispatchItem {
  return {
    kind: item.kind,
    change: { id: '002', folder: item.change, title: item.change, folderPath: `/p/${item.change}` },
    task: item.task === null ? null : { number: item.task, title: item.task },
    commands: [],
  };
}

describe('resolveWaitLogPath', () => {
  it('keys the log by sha256(realpath) so a symlink and its target agree', async () => {
    const real = path.join(tmpDir, 'real');
    const link = path.join(tmpDir, 'link');
    await fs.mkdir(real, { recursive: true });
    await fs.symlink(real, link, 'dir');

    const resolved = await fs.realpath(real);
    const hash = createHash('sha256').update(resolved, 'utf8').digest('hex');
    const expected = path.join(home, '.osq', 'inbox', `${hash}.jsonl`);

    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(await resolveWaitLogPath(real, home), expected);
    assert.equal(await resolveWaitLogPath(link, home), expected);
  });
});

describe('waitEpisodes', () => {
  it('folds duplicates, opened, and gone into one closed episode then a second open one', () => {
    const item = waitItem('halt', '002-dead', '1');
    const records: WaitRecord[] = [
      seen(item, '2026-01-01T10:00:00.000Z', 's1', true),
      seen(item, '2026-01-01T10:05:00.000Z', 's2', false),
      { type: 'opened', item, at: '2026-01-01T10:06:00.000Z', session: 's2', idle: false },
      {
        type: 'gone',
        item,
        at: '2026-01-01T11:00:00.000Z',
        session: 's2',
        idle: false,
        unobserved: false,
      },
      seen(item, '2026-01-02T09:00:00.000Z', 's3', false),
    ];

    const episodes = waitEpisodes(records);
    assert.equal(episodes.length, 2);
    assert.deepEqual(episodes[0].seen, {
      at: '2026-01-01T10:00:00.000Z',
      session: 's1',
      idle: false,
      unobserved: true,
    });
    assert.deepEqual(episodes[0].opened, { at: '2026-01-01T10:06:00.000Z', session: 's2' });
    assert.deepEqual(episodes[0].gone, {
      at: '2026-01-01T11:00:00.000Z',
      session: 's2',
      idle: false,
      unobserved: false,
    });
    assert.equal(episodes[1].opened, null);
    assert.equal(episodes[1].gone, null);
    assert.equal(episodes[1].seen.at, '2026-01-02T09:00:00.000Z');
  });

  it('ignores an opened or gone without an open episode', () => {
    const item = waitItem('approval', '001-unapproved', null);
    const records: WaitRecord[] = [
      { type: 'opened', item, at: '2026-01-01T10:00:00.000Z', session: 's1', idle: true },
      {
        type: 'gone',
        item,
        at: '2026-01-01T10:01:00.000Z',
        session: 's1',
        idle: true,
        unobserved: false,
      },
      { type: 'stop', at: '2026-01-01T10:02:00.000Z', session: 's1' },
    ];
    assert.deepEqual(waitEpisodes(records), []);
  });
});

describe('firstSeenTimes', () => {
  it('maps only the identities with an open episode to their seen time', () => {
    const halt = waitItem('halt', '002-dead', '1');
    const approval = waitItem('approval', '001-unapproved', null);
    const records: WaitRecord[] = [
      seen(approval, '2026-01-01T08:00:00.000Z', 's1', true),
      {
        type: 'gone',
        item: approval,
        at: '2026-01-01T09:00:00.000Z',
        session: 's1',
        idle: false,
        unobserved: false,
      },
      seen(halt, '2026-01-01T10:00:00.000Z', 's1', true),
    ];

    const times = firstSeenTimes(records);
    assert.equal(times.size, 1);
    assert.deepEqual(times.get(dispatchIdentity(halt)), new Date('2026-01-01T10:00:00.000Z'));
    assert.equal(times.has(dispatchIdentity(approval)), false);
  });
});

describe('readWaitLog', () => {
  async function writeLog(lines: string[]): Promise<void> {
    const logPath = await resolveWaitLogPath(tmpDir, home);
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.writeFile(logPath, `${lines.join('\n')}\n`, 'utf8');
  }

  it('returns the parseable records in file order and drops unreadable lines', async () => {
    const first: WaitRecord = seen(
      waitItem('halt', '002-dead', '1'),
      '2026-01-01T10:00:00.000Z',
      's1',
      true,
    );
    const second: WaitRecord = {
      type: 'stop',
      at: '2026-01-01T10:10:00.000Z',
      session: 's1',
    };
    await writeLog([
      JSON.stringify(first),
      'not json at all',
      JSON.stringify({ at: '2026-01-01T10:05:00.000Z', session: 's1' }),
      JSON.stringify(second),
    ]);

    assert.deepEqual(await readWaitLog(tmpDir, home), [first, second]);
  });

  it('returns null when the file does not exist', async () => {
    assert.equal(await readWaitLog(tmpDir, home), null);
  });
});

describe('dispatchIdentity', () => {
  it('gives the same string for a dispatch item and its log item', () => {
    const item = waitItem('halt', '002-dead', '1');
    const identity = dispatchIdentity(item);
    assert.equal(identity, dispatchIdentity(dispatchItem(item)));
    assert.equal(identity, 'halt\u0000002-dead\u00001');
  });

  it('uses an empty task slot for a change-level item', () => {
    const item = waitItem('approval', '001-unapproved', null);
    assert.equal(dispatchIdentity(item), 'approval\u0000001-unapproved\u0000');
    assert.equal(dispatchIdentity(dispatchItem(item)), 'approval\u0000001-unapproved\u0000');
  });
});
