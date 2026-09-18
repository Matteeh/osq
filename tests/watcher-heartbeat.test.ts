import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import {
  type HarnessAdapter,
  type SpawnResult,
  type SpawnTaskOptions,
  appendHarnessEvent,
} from '../src/harness/types.js';
import { computeTaskHeartbeatStats } from '../src/watcher/heartbeat.js';
import { acquireTaskLock, releaseTaskLock } from '../src/watcher/lock.js';
import { runTask } from '../src/watcher/runner.js';

const HEARTBEAT_CONFIG = defineConfig({ log: { heartbeatSeconds: 0.05 } });

/**
 * Adapter that writes several tokens events while "working", so a periodic
 * heartbeat has something to count. It sleeps long enough for the 50ms
 * heartbeat interval to fire multiple times.
 */
class HeartbeatStubAdapter implements HarnessAdapter {
  readonly name = 'heartbeat-stub';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const { specFolderPath, taskNumber } = options;

    for (let i = 1; i <= 4; i++) {
      await appendHarnessEvent(specFolderPath, taskNumber, {
        type: 'tokens',
        timestamp: new Date().toISOString(),
        data: { promptTokens: 10 * i, candidateTokens: 5 * i, totalTokens: 100 * i },
      });
      await sleep(60);
    }

    // Give the heartbeat a chance to observe the final token event.
    await sleep(120);

    const resultsDir = path.join(specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(path.join(resultsDir, `${taskNumber}.md`), '# Stub result\n', 'utf8');

    return { exitCode: 0, pid: 4242, elapsedMs: 500 };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function countHeartbeatLines(stderr: string): number {
  return stderr.split('\n').filter((line) => line.includes('heartbeat')).length;
}

describe('Runner heartbeat', () => {
  let tmpDir: string;
  let specFolder: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-heartbeat-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Heartbeat Logging');
    specFolder = spec.folderPath;

    const taskPath = path.join(specFolder, 'tasks', '1.md');
    const task = [
      '---',
      'title: When a task runs, periodic heartbeats log progress',
      'verify: node -e "process.exit(0)"',
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] should pass',
    ].join('\n');
    await fs.writeFile(taskPath, `${task}\n`, 'utf8');

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('defaults config.log.heartbeatSeconds to 60 seconds', () => {
    assert.equal(DEFAULT_CONFIG.log?.heartbeatSeconds, 60);
    assert.equal(defineConfig({}).log?.heartbeatSeconds, 60);

    const overridden = defineConfig({ log: { heartbeatSeconds: 0.05 } });
    assert.equal(overridden.log?.heartbeatSeconds, 0.05);
  });

  it('computeTaskHeartbeatStats reports elapsed seconds, event count, and total tokens', async () => {
    const eventsDir = path.join(specFolder, '.run', 'events');
    await fs.mkdir(eventsDir, { recursive: true });
    await fs.writeFile(
      path.join(eventsDir, '1.jsonl'),
      [
        '{"type":"started","timestamp":"t","data":{}}',
        '{"type":"tokens","timestamp":"t","data":{"totalTokens":100}}',
        '{"type":"tokens","timestamp":"t","data":{"totalTokens":250}}',
        '{"type":"file_changed","timestamp":"t","data":{}}',
        '',
      ].join('\n'),
      'utf8',
    );

    const stats = await computeTaskHeartbeatStats(specFolder, '1', Date.now() - 1500);
    assert.equal(stats.eventCount, 4);
    assert.equal(stats.totalTokens, 350);
    assert.ok(stats.elapsedSeconds >= 1.4 && stats.elapsedSeconds <= 2.0);
  });

  it('computeTaskHeartbeatStats tolerates a missing event file', async () => {
    const stats = await computeTaskHeartbeatStats(specFolder, '1', Date.now());
    assert.equal(stats.eventCount, 0);
    assert.equal(stats.totalTokens, 0);
  });

  it('logs multiple periodic heartbeat updates with elapsed, events, and tokens', async () => {
    const adapter = new HeartbeatStubAdapter();

    const originalWrite = process.stderr.write;
    let stderr = '';
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof process.stderr.write;

    try {
      const result = await runTask(
        tmpDir,
        specFolder,
        '1',
        HEARTBEAT_CONFIG,
        adapter,
        createLogger('normal'),
      );
      assert.equal(result.success, true);
    } finally {
      process.stderr.write = originalWrite;
    }

    const heartbeats = stderr
      .split('\n')
      .filter((line) => line.includes('heartbeat'))
      .map((line) => line.trim());

    assert.ok(
      heartbeats.length >= 2,
      `expected multiple heartbeat lines, got ${heartbeats.length}: ${stderr}`,
    );
    for (const line of heartbeats) {
      assert.match(
        line,
        /heartbeat \(elapsed: \d+(\.\d+)?s, events: \d+, tokens: \d+(\.\d+)?[kM]?\)/,
      );
    }
    // The final heartbeat must have observed all four tokens events.
    assert.ok(
      heartbeats.some((line) => line.includes('tokens: 1.0k')),
      `expected a heartbeat with the accumulated token total: ${heartbeats.join(' | ')}`,
    );
  });

  it('starts the heartbeat timer unreferenced via unref()', async () => {
    const adapter = new HeartbeatStubAdapter();

    const originalSetInterval = globalThis.setInterval;
    const createdTimers: NodeJS.Timeout[] = [];
    const unrefedTimers: NodeJS.Timeout[] = [];

    globalThis.setInterval = ((
      callback: (...args: unknown[]) => void,
      ms?: number,
      ...args: unknown[]
    ) => {
      const timer = originalSetInterval(callback, ms, ...args);
      const originalUnref = timer.unref.bind(timer);
      timer.unref = () => {
        unrefedTimers.push(timer);
        return originalUnref();
      };
      createdTimers.push(timer);
      return timer;
    }) as unknown as typeof setInterval;

    try {
      await runTask(tmpDir, specFolder, '1', HEARTBEAT_CONFIG, adapter, createLogger('quiet'));
    } finally {
      globalThis.setInterval = originalSetInterval;
    }

    assert.equal(createdTimers.length, 1, 'expected exactly one heartbeat interval');
    assert.deepEqual(
      unrefedTimers,
      createdTimers,
      'expected the heartbeat interval to be unref()ed',
    );
  });

  it('clears the heartbeat timer in the finally block so it stops on completion', async () => {
    const adapter = new HeartbeatStubAdapter();

    const originalWrite = process.stderr.write;
    let stderr = '';
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
      return true;
    }) as typeof process.stderr.write;

    let atCompletion = 0;
    try {
      const result = await runTask(
        tmpDir,
        specFolder,
        '1',
        HEARTBEAT_CONFIG,
        adapter,
        createLogger('normal'),
      );
      assert.equal(result.success, true);
      atCompletion = countHeartbeatLines(stderr);

      // If the timer leaked, more heartbeats would be written during this wait.
      await sleep(250);
    } finally {
      process.stderr.write = originalWrite;
    }

    assert.ok(atCompletion >= 1, 'expected at least one heartbeat during execution');
    assert.equal(
      countHeartbeatLines(stderr),
      atCompletion,
      'heartbeat timer kept firing after runTask resolved',
    );
  });
});

describe('Watcher lifecycle modules', () => {
  it('acquires and releases a task lock through the watcher wrapper', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lock-wrapper-test-'));
    const runDir = path.join(dir, '.run');
    try {
      const first = await acquireTaskLock(runDir, '1');
      assert.equal(first.acquired, true);

      const second = await acquireTaskLock(runDir, '1');
      assert.equal(second.acquired, false);

      await releaseTaskLock(runDir, '1');
      const third = await acquireTaskLock(runDir, '1');
      assert.equal(third.acquired, true);
      await releaseTaskLock(runDir, '1');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps lock.ts and heartbeat.ts under the 200 line module budget', async () => {
    for (const file of ['lock.ts', 'heartbeat.ts']) {
      const content = await fs.readFile(path.join(process.cwd(), 'src', 'watcher', file), 'utf8');
      const lines = content.split('\n').length - (content.endsWith('\n') ? 1 : 0);
      assert.ok(lines < 200, `${file} has ${lines} lines`);
    }
  });
});
