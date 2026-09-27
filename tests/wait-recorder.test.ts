import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { DispatchItem } from '../src/core/status/dispatch-items.js';
import { type WaitRecord, readWaitLog, resolveWaitLogPath } from '../src/core/status/wait-log.js';
import { createWaitRecorder } from '../src/core/status/wait-recorder.js';

let tmpDir: string;
let home: string;
let stderr: string[];

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-wait-recorder-'));
  home = path.join(tmpDir, 'home');
  stderr = [];
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

function item(kind: DispatchItem['kind'], folder: string, task: string | null): DispatchItem {
  return {
    kind,
    change: { id: folder.slice(0, 3), folder, title: folder, folderPath: `/p/${folder}` },
    task: task === null ? null : { number: task, title: task },
    commands: [],
  };
}

async function records(): Promise<WaitRecord[]> {
  return (await readWaitLog(tmpDir, home)) ?? [];
}

async function seed(record: Record<string, unknown>): Promise<void> {
  const logPath = await resolveWaitLogPath(tmpDir, home);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, 'utf8');
}

describe('createWaitRecorder', () => {
  it('marks open runs and unseen items on the first observe', async () => {
    await seed({
      type: 'seen',
      at: '2026-01-01T00:00:00.000Z',
      session: 'old-1',
      item: { kind: 'halt', change: '002-dead', task: '1' },
      idle: true,
      unobserved: true,
    });
    const recorder = createWaitRecorder(tmpDir, 'cards', { home, stderr: (m) => stderr.push(m) });
    const at = new Date('2026-01-02T00:00:00.000Z');
    await recorder.observe([item('approval', '001-unapproved', null)], false, at);

    const log = await records();
    assert.deepEqual(
      log.map((record) => record.type),
      ['seen', 'start', 'gone', 'seen', 'top'],
    );
    assert.equal(log[1].type === 'start' ? log[1].mode : null, 'cards');
    assert.match(log[1].session, new RegExp(`^${process.pid}-${at.getTime()}$`));
    assert.deepEqual(log[2], {
      type: 'gone',
      item: { kind: 'halt', change: '002-dead', task: '1' },
      idle: false,
      unobserved: true,
      at: at.toISOString(),
      session: log[1].session,
    });
    assert.deepEqual(log[3], {
      type: 'seen',
      item: { kind: 'approval', change: '001-unapproved', task: null },
      idle: false,
      unobserved: true,
      at: at.toISOString(),
      session: log[1].session,
    });
    assert.deepEqual(log[4], {
      type: 'top',
      item: { kind: 'approval', change: '001-unapproved', task: null },
      idle: false,
      at: at.toISOString(),
      session: log[1].session,
    });
    assert.deepEqual(stderr, []);
  });

  it('marks appeared and departed items on a later observe and skips a same top', async () => {
    const recorder = createWaitRecorder(tmpDir, 'follow', { home, stderr: (m) => stderr.push(m) });
    const approval = item('approval', '001-unapproved', null);
    const halt = item('halt', '002-dead', '1');

    await recorder.observe([approval], false, new Date('2026-01-02T00:00:00.000Z'));
    await recorder.observe([halt], true, new Date('2026-01-02T00:10:00.000Z'));

    let log = await records();
    assert.deepEqual(
      log.map((record) => record.type),
      ['start', 'seen', 'top', 'seen', 'gone', 'top'],
    );
    assert.equal(log[3].type === 'seen' ? log[3].unobserved : null, false);
    assert.equal(log[3].type === 'seen' ? log[3].idle : null, true);
    assert.equal(log[4].type === 'gone' ? log[4].unobserved : null, false);
    assert.deepEqual(log[5].type === 'top' ? log[5].item : null, {
      kind: 'halt',
      change: '002-dead',
      task: '1',
    });

    await recorder.observe([halt], true, new Date('2026-01-02T00:20:00.000Z'));
    log = await records();
    assert.equal(log.length, 6);
  });

  it('appends opened and stop after a start', async () => {
    const recorder = createWaitRecorder(tmpDir, 'cards', { home, stderr: (m) => stderr.push(m) });
    const approval = item('approval', '001-unapproved', null);
    await recorder.observe([approval], true, new Date('2026-01-02T00:00:00.000Z'));
    await recorder.opened(approval, true, new Date('2026-01-02T00:01:00.000Z'));
    await recorder.stop(new Date('2026-01-02T00:02:00.000Z'));

    const log = await records();
    assert.deepEqual(
      log.map((record) => record.type),
      ['start', 'seen', 'top', 'opened', 'stop'],
    );
  });

  it('writes nothing when stop comes before any observe', async () => {
    const recorder = createWaitRecorder(tmpDir, 'cards', { home, stderr: (m) => stderr.push(m) });
    await recorder.stop(new Date('2026-01-02T00:00:00.000Z'));

    const logPath = await resolveWaitLogPath(tmpDir, home);
    await assert.rejects(fs.access(logPath));
    assert.equal(await readWaitLog(tmpDir, home), null);
    assert.deepEqual(stderr, []);
  });

  it('resolves both observes and reports once when the home is not writable', async () => {
    const fileHome = path.join(tmpDir, 'home-file');
    await fs.writeFile(fileHome, 'not a directory', 'utf8');
    const recorder = createWaitRecorder(tmpDir, 'cards', {
      home: fileHome,
      stderr: (m) => stderr.push(m),
    });
    const approval = item('approval', '001-unapproved', null);

    await recorder.observe([approval], true, new Date('2026-01-02T00:00:00.000Z'));
    await recorder.observe([approval], true, new Date('2026-01-02T00:10:00.000Z'));

    assert.equal(stderr.length, 1);
    assert.match(stderr[0], /^osq inbox: wait log: /);
  });
});
