import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { collectInboxWait, formatInboxWait } from '../src/core/report/report-inbox-wait.js';
import { type WaitItem, resolveWaitLogPath } from '../src/core/status/wait-log.js';

let tmpDir: string;
let home: string;
let projectRoot: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-report-inbox-wait-'));
  home = path.join(tmpDir, 'home');
  projectRoot = path.join(tmpDir, 'project');
  await fs.mkdir(projectRoot, { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Write raw records as the wait log under the temporary home. */
async function writeLog(records: readonly unknown[]): Promise<void> {
  const logPath = await resolveWaitLogPath(projectRoot, home);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
}

/** Copy the hand-written fixture log into place. */
async function copyFixture(): Promise<void> {
  const content = await fs.readFile(path.resolve('fixture/report/inbox-wait.jsonl'), 'utf8');
  const logPath = await resolveWaitLogPath(projectRoot, home);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, content);
}

function item(kind: WaitItem['kind'], change: string, task: string | null): WaitItem {
  return { kind, change, task };
}

describe('collectInboxWait', () => {
  it('returns null when there is no wait log', async () => {
    assert.equal(await collectInboxWait(projectRoot, { home }), null);
  });

  it("folds the fixture log into each kind's waits and unseen markers", async () => {
    await copyFixture();

    const report = await collectInboxWait(projectRoot, { home });
    assert.ok(report);
    assert.equal(report.since, null);
    assert.equal(report.until, null);
    assert.deepEqual(report.kinds.approval, {
      handled: 2,
      medianSeconds: 121,
      longestSeconds: 181,
      startedUnseen: 1,
      endedUnseen: 0,
    });
    assert.deepEqual(report.kinds.halt, {
      handled: 1,
      medianSeconds: 60,
      longestSeconds: 60,
      startedUnseen: 0,
      endedUnseen: 1,
    });
    assert.deepEqual(report.kinds.land, {
      handled: 0,
      medianSeconds: null,
      longestSeconds: null,
      startedUnseen: 0,
      endedUnseen: 0,
    });
    assert.deepEqual(report.kinds.verify, {
      handled: 0,
      medianSeconds: null,
      longestSeconds: null,
      startedUnseen: 0,
      endedUnseen: 0,
    });
  });

  it('measures the fixture idle union and the card-session counts', async () => {
    await copyFixture();

    const report = await collectInboxWait(projectRoot, { home });
    assert.ok(report);
    assert.equal(report.idleSeconds, 90);
    assert.deepEqual(report.sessions, {
      count: 2,
      handled: 3,
      medianHandled: 2,
      mostHandled: 3,
    });
  });

  it('rounds the median of an even count of approval waits', async () => {
    await writeLog([
      { type: 'start', at: '2026-01-01T09:00:00.000Z', session: 's1', mode: 'cards', idle: false },
      {
        type: 'seen',
        at: '2026-01-01T10:00:00.000Z',
        session: 's1',
        item: item('approval', '001-alpha', null),
        idle: false,
        unobserved: false,
      },
      {
        type: 'gone',
        at: '2026-01-01T10:01:00.000Z',
        session: 's1',
        item: item('approval', '001-alpha', null),
        idle: false,
        unobserved: false,
      },
      {
        type: 'seen',
        at: '2026-01-01T10:00:00.000Z',
        session: 's1',
        item: item('approval', '002-beta', null),
        idle: false,
        unobserved: false,
      },
      {
        type: 'gone',
        at: '2026-01-01T10:03:01.000Z',
        session: 's1',
        item: item('approval', '002-beta', null),
        idle: false,
        unobserved: false,
      },
    ]);

    const report = await collectInboxWait(projectRoot, { home });
    assert.equal(report?.kinds.approval.medianSeconds, 121);
    assert.equal(report?.kinds.approval.longestSeconds, 181);
  });

  it('unions two overlapping idle intervals across sessions', async () => {
    await writeLog([
      { type: 'start', at: '2026-01-01T09:00:00.000Z', session: 's1', mode: 'cards', idle: false },
      { type: 'start', at: '2026-01-01T09:00:00.000Z', session: 's2', mode: 'cards', idle: false },
      {
        type: 'top',
        at: '2026-01-01T10:00:00.000Z',
        session: 's1',
        item: item('halt', '003-gamma', '1'),
        idle: true,
      },
      {
        type: 'top',
        at: '2026-01-01T10:00:30.000Z',
        session: 's2',
        item: item('halt', '003-gamma', '1'),
        idle: true,
      },
      { type: 'top', at: '2026-01-01T10:01:00.000Z', session: 's1', item: null, idle: false },
      { type: 'stop', at: '2026-01-01T10:01:30.000Z', session: 's2' },
    ]);

    const report = await collectInboxWait(projectRoot, { home });
    assert.equal(report?.idleSeconds, 90);
  });

  it('measures nothing when the period starts after every record', async () => {
    await copyFixture();

    const report = await collectInboxWait(projectRoot, {
      home,
      since: new Date('2026-02-01T00:00:00.000Z'),
    });
    assert.ok(report);
    for (const kind of ['approval', 'halt', 'land', 'verify'] as const) {
      assert.equal(report.kinds[kind].handled, 0);
    }
    assert.equal(report.idleSeconds, null);
    assert.equal(report.sessions, null);
  });
});

describe('formatInboxWait', () => {
  it('prints the fixture section lines in order', async () => {
    await copyFixture();

    const report = await collectInboxWait(projectRoot, { home });
    assert.ok(report);
    assert.deepEqual(formatInboxWait(report), [
      'Inbox waiting (start to now):',
      '  approval: 2 handled, median 2m 1s, longest 3m 1s, 1 first seen at inbox start',
      '  halt: 1 handled, median 1m 0s, longest 1m 0s, 1 gone while no inbox ran',
      '  land: not measured',
      '  verify: not measured',
      "  watcher idle on a human's item: 1m 30s",
      '  card sessions: 2, 3 handled, median 2 per session, most 3',
    ]);
  });

  it('says not measured on every line for an empty period', async () => {
    await copyFixture();

    const report = await collectInboxWait(projectRoot, {
      home,
      since: new Date('2026-02-01T00:00:00.000Z'),
    });
    assert.ok(report);
    const lines = formatInboxWait(report);
    assert.deepEqual(lines.slice(1), [
      '  approval: not measured',
      '  halt: not measured',
      '  land: not measured',
      '  verify: not measured',
      "  watcher idle on a human's item: not measured",
      '  card sessions: not measured',
    ]);
  });

  it('prints a midnight bound as a date and another as its ISO string', async () => {
    await copyFixture();

    const report = await collectInboxWait(projectRoot, {
      home,
      since: new Date('2026-01-01T00:00:00.000Z'),
      until: new Date('2026-01-02T03:04:05.000Z'),
    });
    assert.ok(report);
    assert.equal(report.since, '2026-01-01T00:00:00.000Z');
    assert.equal(report.until, '2026-01-02T03:04:05.000Z');
    assert.equal(
      formatInboxWait(report)[0],
      'Inbox waiting (2026-01-01 to 2026-01-02T03:04:05.000Z):',
    );
  });
});
