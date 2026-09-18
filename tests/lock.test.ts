import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { acquireLock, isPidRunning, reapStaleLocks, releaseLock } from '../src/core/lock.js';

async function exists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

describe('Lock and Reaper', () => {
  let tmpDir: string;
  let runDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lock-test-'));
    runDir = path.join(tmpDir, '.run');
    await fs.mkdir(runDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('acquireLock writes running marker exclusively', async () => {
    const lock1 = await acquireLock(runDir, '1');
    assert.equal(lock1.acquired, true);
    assert.equal(lock1.pid, process.pid);

    // Second acquisition for the same task must fail
    const lock2 = await acquireLock(runDir, '1');
    assert.equal(lock2.acquired, false);

    // Acquisition for another task succeeds
    const lock3 = await acquireLock(runDir, '2');
    assert.equal(lock3.acquired, true);
  });

  it('releaseLock removes running marker cleanly', async () => {
    await acquireLock(runDir, '1');
    await releaseLock(runDir, '1');

    // After release, acquiring again should succeed
    const lockAgain = await acquireLock(runDir, '1');
    assert.equal(lockAgain.acquired, true);
  });

  it('isPidRunning accurately reports current process and non-existent process', () => {
    assert.equal(isPidRunning(process.pid), true);
    // 99999999 is extraordinarily unlikely to exist
    assert.equal(isPidRunning(99999999), false);
  });

  it('reapStaleLocks detects a dead pid and unlinks the lock without writing a dead marker', async () => {
    const runningDir = path.join(runDir, 'running');
    await fs.mkdir(runningDir, { recursive: true });

    // Lock file with dead pid (99999999) and recent timestamp
    const startedAt = Date.now();
    await fs.writeFile(
      path.join(runningDir, '1.pid'),
      JSON.stringify({ pid: 99999999, startedAt }),
      'utf8',
    );

    const reaped = await reapStaleLocks(tmpDir, 300);
    assert.equal(reaped.length, 1);
    assert.deepEqual(reaped[0], {
      taskNumber: '1',
      reason: 'crashed',
      pid: 99999999,
      startedAt,
    });

    // Verify running marker is deleted
    await assert.rejects(async () => {
      await fs.stat(path.join(runningDir, '1.pid'));
    });

    // Detection is pure: it never creates dead markers or the dead directory.
    assert.equal(await exists(path.join(runDir, 'dead', '1.md')), false);
    assert.equal(await exists(path.join(runDir, 'dead')), false);
  });

  it('reapStaleLocks detects an expired lock without writing a dead marker', async () => {
    const runningDir = path.join(runDir, 'running');
    await fs.mkdir(runningDir, { recursive: true });

    // Lock file with active pid (current process) but older than staleLockSeconds (1s)
    const startedAt = Date.now() - 5000;
    await fs.writeFile(
      path.join(runningDir, '2.pid'),
      JSON.stringify({ pid: process.pid, startedAt }),
      'utf8',
    );

    const reaped = await reapStaleLocks(tmpDir, 1);
    assert.equal(reaped.length, 1);
    assert.deepEqual(reaped[0], {
      taskNumber: '2',
      reason: 'timeout',
      pid: process.pid,
      startedAt,
    });

    await assert.rejects(async () => {
      await fs.stat(path.join(runningDir, '2.pid'));
    });

    assert.equal(await exists(path.join(runDir, 'dead', '2.md')), false);
    assert.equal(await exists(path.join(runDir, 'dead')), false);
  });
});
