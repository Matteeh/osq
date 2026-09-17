import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createNewSpec } from '../src/core/new.js';
import { AgyAdapter } from '../src/harness/agy.js';
import { DEFAULT_KILL_GRACE_PERIOD_MS, spawnWithTimeout } from '../src/harness/process.js';

describe('Shared Process Execution and Timeout Helper', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-process-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('spawnWithTimeout executes child process with given command, args, cwd, and environment', async () => {
    let capturedStdout = '';
    const script = `
      process.stdout.write(JSON.stringify({
        cwd: process.cwd(),
        envVal: process.env.TEST_VAR,
        argv: process.argv.slice(1)
      }));
    `;

    const result = await spawnWithTimeout({
      command: process.execPath,
      args: ['-e', script, 'arg1', 'arg2'],
      cwd: tmpDir,
      env: {
        ...process.env,
        TEST_VAR: 'custom-val-123',
      },
      onStdout: (data) => {
        capturedStdout += data;
      },
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.equal(result.error, undefined);

    const parsed = JSON.parse(result.stdout);
    // On macOS / Linux tmp dirs may resolve symlinks (e.g. /tmp vs /private/tmp)
    const realTmpDir = await fs.realpath(tmpDir);
    const realCwd = await fs.realpath(parsed.cwd);
    assert.equal(realCwd, realTmpDir);
    assert.equal(parsed.envVal, 'custom-val-123');
    assert.deepEqual(parsed.argv, ['arg1', 'arg2']);
    assert.equal(capturedStdout, result.stdout);
  });

  it('spawnWithTimeout terminates process with SIGTERM when execution exceeds timeoutSeconds', async () => {
    const result = await spawnWithTimeout({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000);'],
      timeoutSeconds: 1,
    });

    assert.equal(result.timedOut, true);
    assert.equal(result.signal, 'SIGTERM');
  });

  it('spawnWithTimeout forces SIGKILL after 5000ms grace period if SIGTERM fails to terminate', async () => {
    assert.equal(DEFAULT_KILL_GRACE_PERIOD_MS, 5000);

    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      let isReady = false;
      let resolveReady: () => void;
      const readyPromise = new Promise<void>((r) => {
        resolveReady = r;
      });

      // Child script traps and ignores SIGTERM
      const script = `
        process.stdout.write('READY\\n');
        process.on('SIGTERM', () => {});
        setInterval(() => {}, 1000);
      `;

      const processPromise = spawnWithTimeout({
        command: process.execPath,
        args: ['-e', script],
        timeoutSeconds: 1,
        onStdout: (chunk) => {
          if (chunk.includes('READY')) {
            isReady = true;
            resolveReady();
          }
        },
      });

      await readyPromise;
      assert.equal(isReady, true);

      // Advance timer by 1s (1000ms) to trigger timeout and send SIGTERM
      mock.timers.tick(1000);

      // Advance timer by 4999ms (within the 5000ms grace period) - should not have sent SIGKILL yet
      mock.timers.tick(4999);

      // Advance by 1ms (completing the 5000ms grace period) - triggers SIGKILL
      mock.timers.tick(1);

      const result = await processPromise;
      assert.equal(result.timedOut, true);
      assert.equal(result.signal, 'SIGKILL');
    } finally {
      mock.timers.reset();
    }
  });

  it('spawnWithTimeout marks timedOut true and returns non-zero exit code on timeout', async () => {
    const result = await spawnWithTimeout({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000);'],
      timeoutSeconds: 1,
    });

    assert.equal(result.timedOut, true);
    assert.notEqual(result.exitCode, 0);
    assert.equal(result.exitCode, 124);
    assert.equal(result.error, 'Task execution timed out');
  });

  it('AgyAdapter uses spawnWithTimeout helper preserving existing timeout behavior', async () => {
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Agy Timeout Behavior');
    const specFolder = spec.folderPath;

    // Create a mock agy script that sleeps and terminates on SIGTERM
    const mockAgyBin = path.join(tmpDir, 'mock-agy.sh');
    await fs.writeFile(mockAgyBin, '#!/bin/sh\nexec sleep 10\n', { mode: 0o755 });

    const origAgyPath = process.env.AGY_PATH;
    process.env.AGY_PATH = mockAgyBin;

    try {
      const adapter = new AgyAdapter();
      const result = await adapter.spawn({
        projectRoot: tmpDir,
        specFolderPath: specFolder,
        taskNumber: '1',
        taskTitle: 'When agent times out',
        verifyCommand: 'node -e "process.exit(0)"',
        scope: ['src/test.ts'],
        entry: ['src/test.ts'],
        skills: [],
        tier: 'coding',
        timeoutSeconds: 1,
        config: DEFAULT_CONFIG,
      });

      assert.equal(result.timedOut, true);
      assert.equal(result.exitCode, 124);
      assert.equal(result.signal, 'SIGTERM');
      assert.equal(result.error, 'Task execution timed out');

      // Verify events logged
      const eventFilePath = path.join(specFolder, '.run', 'events', '1.jsonl');
      const eventContent = await fs.readFile(eventFilePath, 'utf8');
      const lines = eventContent
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));

      assert.equal(lines[0].type, 'started');
      assert.equal(lines[1].type, 'exited');
      assert.equal(lines[1].data.timedOut, true);
      assert.equal(lines[1].data.exitCode, 124);
      assert.equal(lines[1].data.signal, 'SIGTERM');
    } finally {
      if (origAgyPath !== undefined) {
        process.env.AGY_PATH = origAgyPath;
      } else {
        process.env.AGY_PATH = undefined;
      }
    }
  });
});
