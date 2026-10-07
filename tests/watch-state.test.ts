import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  isProcessAlive,
  readWatchState,
  removeWatchRecord,
  removeWatchRecordSync,
  watchStateDir,
  writeServiceRecord,
  writeWatcherRecord,
} from '../src/core/run/watch-state.js';

const DEAD_PID = 999999;
const LIVE_PID = process.pid;
const isAlive = (pid: number): boolean => pid === LIVE_PID;

describe('watch state files', () => {
  let base: string;
  let home: string;
  let projectRoot: string;
  let otherRoot: string;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-watch-state-'));
    home = path.join(base, 'home');
    projectRoot = path.join(base, 'project');
    otherRoot = path.join(base, 'other');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(projectRoot, { recursive: true });
    await fs.mkdir(otherRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('returns the service record, a null watcher, and the log path when one pid is dead', async () => {
    const dir = await watchStateDir(projectRoot, home);
    await writeServiceRecord(
      projectRoot,
      {
        pid: LIVE_PID,
        startedAt: '2026-10-07T00:00:00.000Z',
        log: path.join(dir, 'watch.log'),
      },
      home,
    );
    await writeWatcherRecord(
      projectRoot,
      {
        pid: DEAD_PID,
        mode: 'terminal',
        version: '0.2.4',
        commit: 'f532410',
        startedAt: '2026-10-07T00:00:01.000Z',
        waiting: null,
      },
      home,
    );

    const state = await readWatchState(projectRoot, home, isAlive);
    assert.equal(state.service?.pid, LIVE_PID);
    assert.equal(state.watcher, null);
    assert.equal(state.log, path.join(dir, 'watch.log'));
    assert.equal(state.logExists, false);

    await fs.writeFile(path.join(dir, 'watch.log'), 'log');
    const withLog = await readWatchState(projectRoot, home, isAlive);
    assert.equal(withLog.logExists, true);
  });

  it('keeps the record of another process', async () => {
    await writeWatcherRecord(
      projectRoot,
      {
        pid: LIVE_PID,
        mode: 'background',
        version: '0.2.4',
        commit: 'f532410',
        startedAt: '2026-10-07T00:00:00.000Z',
        waiting: 'a new osq build is being written',
      },
      home,
    );
    await removeWatchRecord(projectRoot, 'watcher', LIVE_PID + 1, home);
    const state = await readWatchState(projectRoot, home, isAlive);
    assert.equal(state.watcher?.pid, LIVE_PID);
    assert.equal(state.watcher?.waiting, 'a new osq build is being written');

    await removeWatchRecord(projectRoot, 'watcher', LIVE_PID, home);
    assert.equal((await readWatchState(projectRoot, home, isAlive)).watcher, null);
  });

  it('gives each project root its own folder and resolves a symlink to that root', async () => {
    const dir = await watchStateDir(projectRoot, home);
    const otherDir = await watchStateDir(otherRoot, home);
    assert.notEqual(dir, otherDir);

    const link = path.join(base, 'link');
    await fs.symlink(projectRoot, link, 'dir');
    assert.equal(await watchStateDir(link, home), dir);

    await writeWatcherRecord(
      projectRoot,
      {
        pid: LIVE_PID,
        mode: 'terminal',
        version: '0.2.4',
        commit: 'f532410',
        startedAt: '2026-10-07T00:00:00.000Z',
        waiting: null,
      },
      home,
    );
    const viaLink = await readWatchState(link, home, isAlive);
    assert.equal(viaLink.watcher?.pid, LIVE_PID);
  });

  it('reads a malformed record as null', async () => {
    const dir = await watchStateDir(projectRoot, home);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'watcher.json'), 'not json');
    await fs.writeFile(path.join(dir, 'service.json'), JSON.stringify({ pid: 'nope' }));
    const state = await readWatchState(projectRoot, home, isAlive);
    assert.equal(state.watcher, null);
    assert.equal(state.service, null);
  });

  it('removes a record synchronously only when the pid matches', async () => {
    const dir = await watchStateDir(projectRoot, home);
    await writeServiceRecord(
      projectRoot,
      { pid: LIVE_PID, startedAt: '2026-10-07T00:00:00.000Z', log: path.join(dir, 'watch.log') },
      home,
    );
    removeWatchRecordSync(dir, 'service', LIVE_PID + 1);
    assert.equal((await readWatchState(projectRoot, home, isAlive)).service?.pid, LIVE_PID);
    removeWatchRecordSync(dir, 'service', LIVE_PID);
    assert.equal((await readWatchState(projectRoot, home, isAlive)).service, null);
    removeWatchRecordSync(dir, 'service', LIVE_PID);
  });

  it('creates the folder when writing a record', async () => {
    const dir = await watchStateDir(projectRoot, home);
    await assert.rejects(fs.access(dir));
    await writeWatcherRecord(
      projectRoot,
      {
        pid: LIVE_PID,
        mode: 'terminal',
        version: '0.2.4',
        commit: 'f532410',
        startedAt: '2026-10-07T00:00:00.000Z',
        waiting: null,
      },
      home,
    );
    await fs.access(path.join(dir, 'watcher.json'));
  });

  it('reports a live pid as alive and an out-of-range pid as dead', () => {
    assert.equal(isProcessAlive(process.pid), true);
    assert.equal(isProcessAlive(Number.MAX_SAFE_INTEGER), false);
  });
});
