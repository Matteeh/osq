import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  readServerRecord,
  readWatchState,
  removeWatchRecord,
  removeWatchRecordSync,
  watchStateDir,
  writeServerRecord,
  writeServiceRecord,
  writeWatcherRecord,
} from '../src/core/run/watch-state.js';

const DEAD_PID = 999999;
const LIVE_PID = process.pid;
const isAlive = (pid: number): boolean => pid === LIVE_PID;

describe('server state files', () => {
  let base: string;
  let home: string;
  let projectRoot: string;
  let serverLog: string;
  let watchLog: string;

  beforeEach(async () => {
    base = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-server-state-'));
    home = path.join(base, 'home');
    projectRoot = path.join(base, 'project');
    await fs.mkdir(home, { recursive: true });
    await fs.mkdir(projectRoot, { recursive: true });
    const dir = await watchStateDir(projectRoot, home);
    serverLog = path.join(dir, 'server.log');
    watchLog = path.join(dir, 'watch.log');
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('returns a live server record, then null for a dead pid, with watch state unchanged', async () => {
    await writeServiceRecord(
      projectRoot,
      { pid: LIVE_PID, startedAt: '2026-10-09T00:00:00.000Z', log: watchLog },
      home,
    );
    await writeWatcherRecord(
      projectRoot,
      {
        pid: LIVE_PID,
        mode: 'background',
        version: '0.2.4',
        commit: 'f532410',
        startedAt: '2026-10-09T00:00:01.000Z',
        waiting: null,
      },
      home,
    );

    await writeServerRecord(
      projectRoot,
      {
        pid: LIVE_PID,
        startedAt: '2026-10-09T00:00:02.000Z',
        log: serverLog,
        url: 'http://127.0.0.1:4174/p/osq/',
      },
      home,
    );
    const before = await readWatchState(projectRoot, home, isAlive);
    const live = await readServerRecord(projectRoot, home, isAlive);
    assert.equal(live?.pid, LIVE_PID);
    assert.equal(live?.startedAt, '2026-10-09T00:00:02.000Z');
    assert.equal(live?.log, serverLog);
    assert.equal(live?.url, 'http://127.0.0.1:4174/p/osq/');

    await writeServerRecord(
      projectRoot,
      {
        pid: DEAD_PID,
        startedAt: '2026-10-09T00:00:03.000Z',
        log: serverLog,
        url: 'http://127.0.0.1:4174/p/osq/',
      },
      home,
    );
    const dead = await readServerRecord(projectRoot, home, isAlive);
    assert.equal(dead, null);

    const after = await readWatchState(projectRoot, home, isAlive);
    assert.deepEqual(after, before);
    assert.equal(after.service?.pid, LIVE_PID);
    assert.equal(after.watcher?.pid, LIVE_PID);
  });

  it('keeps the server record of another process', async () => {
    await writeServerRecord(
      projectRoot,
      {
        pid: LIVE_PID,
        startedAt: '2026-10-09T00:00:00.000Z',
        log: serverLog,
        url: 'http://127.0.0.1:4174/p/osq/',
      },
      home,
    );

    await removeWatchRecord(projectRoot, 'server', DEAD_PID, home);
    assert.equal((await readServerRecord(projectRoot, home, isAlive))?.pid, LIVE_PID);

    removeWatchRecordSync(await watchStateDir(projectRoot, home), 'server', DEAD_PID);
    assert.equal((await readServerRecord(projectRoot, home, isAlive))?.pid, LIVE_PID);

    await removeWatchRecord(projectRoot, 'server', LIVE_PID, home);
    assert.equal(await readServerRecord(projectRoot, home, isAlive), null);
  });

  it('reads a malformed server.json as null', async () => {
    const dir = await watchStateDir(projectRoot, home);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'server.json'), 'not json');
    assert.equal(await readServerRecord(projectRoot, home, isAlive), null);
    await fs.writeFile(path.join(dir, 'server.json'), JSON.stringify({ pid: 'nope' }));
    assert.equal(await readServerRecord(projectRoot, home, isAlive), null);
  });
});
