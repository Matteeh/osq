import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { acquireLock } from '../src/core/lock.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import { formatTaskOutcomeSummary, runTask } from '../src/watcher/runner.js';

async function captureStderr(fn: () => Promise<void>): Promise<string> {
  const originalWrite = process.stderr.write;
  let stderr = '';
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stderr.write = originalWrite;
  }

  return stderr;
}

function outcomeLine(stderr: string, taskNumber: string): string | undefined {
  return stderr
    .split('\n')
    .find(
      (line) =>
        line.startsWith(`task ${taskNumber} `) &&
        (line.includes('verified (passed)') || line.includes('dead (reason:')),
    );
}

async function writeTask(specFolder: string, verify: string): Promise<void> {
  const taskPath = path.join(specFolder, 'tasks', '1.md');
  const task = [
    '---',
    'title: When outcomes are logged, one line summarises the task',
    `verify: ${verify}`,
    'scope: []',
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] should be observed',
  ].join('\n');
  await fs.writeFile(taskPath, `${task}\n`, 'utf8');
}

describe('Runner outcome logging', () => {
  let tmpDir: string;
  let specFolder: string;
  let adapter: MockAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-outcome-log-test-'));
    await scaffoldProject(tmpDir);
    const spec = await createNewSpec(tmpDir, 'Outcome Logging');
    specFolder = spec.folderPath;
    adapter = new MockAdapter();
    await writeTask(specFolder, 'node -e "process.exit(0)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    adapter.resetBehavior();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('formatTaskOutcomeSummary', () => {
    it('renders a passed summary for a successful task', () => {
      assert.equal(formatTaskOutcomeSummary('1', true), 'task 1 verified (passed)');
    });

    it('renders a dead summary with the failure reason', () => {
      assert.equal(
        formatTaskOutcomeSummary('0', false, 'verify_red'),
        'task 0 dead (reason: verify_red)',
      );
    });

    it('appends the extra detail after the reason', () => {
      assert.equal(
        formatTaskOutcomeSummary('2', false, 'verify_red', 'timed_out: true'),
        'task 2 dead (reason: verify_red, timed_out: true)',
      );
      assert.equal(
        formatTaskOutcomeSummary('2', false, 'crashed', 'code: 1'),
        'task 2 dead (reason: crashed, code: 1)',
      );
    });

    it('produces a single line for every outcome', () => {
      const lines = [
        formatTaskOutcomeSummary('1', true),
        formatTaskOutcomeSummary('1', false, 'spec_conflict'),
        formatTaskOutcomeSummary('1', false, 'already_running'),
        formatTaskOutcomeSummary('1', false, 'crashed', 'code: 7'),
        formatTaskOutcomeSummary('1', false, 'timeout'),
        formatTaskOutcomeSummary('1', false, 'no_result'),
        formatTaskOutcomeSummary('1', false, 'verify_red', 'timed_out: true'),
      ];

      for (const line of lines) {
        assert.ok(!line.includes('\n'), `expected single line, got ${JSON.stringify(line)}`);
      }
    });
  });

  it('logs a single verified line upon successful verification', async () => {
    const logger = createLogger('normal');

    let success = false;
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      success = result.success;
    });

    assert.equal(success, true);
    const line = outcomeLine(stderr, '1');
    assert.equal(line, 'task 1 verified (passed)');
    assert.match(stderr, /task 1 verified \(passed\)/);
    assert.ok(stderr.includes('task 1 verified (passed)'));
  });

  it('logs a dead line and writes the marker upon verification failure', async () => {
    await writeTask(specFolder, 'node -e "process.exit(1)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const logger = createLogger('normal');
    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'verify_red');
    assert.equal(outcomeLine(stderr, '1'), 'task 1 dead (reason: verify_red)');

    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: verify_red'));
  });

  it('logs timed_out detail when verification times out', async () => {
    await writeTask(specFolder, 'node -e "setInterval(()=>{}, 1000)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const shortConfig = {
      ...DEFAULT_CONFIG,
      timeouts: { ...DEFAULT_CONFIG.timeouts, verifyTimeoutSeconds: 1 },
    };
    const logger = createLogger('normal');

    const stderr = await captureStderr(async () => {
      await runTask(tmpDir, specFolder, '1', shortConfig, adapter, logger);
    });

    assert.equal(outcomeLine(stderr, '1'), 'task 1 dead (reason: verify_red, timed_out: true)');
    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('timed_out: true'));
  });

  it('logs a timeout dead line when the agent exceeds its timeout', async () => {
    adapter.setBehavior({ timedOut: true });
    const logger = createLogger('normal');

    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'timeout');
    assert.equal(outcomeLine(stderr, '1'), 'task 1 dead (reason: timeout)');
    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: timeout'));
  });

  it('logs a crashed dead line with the exit code when the agent crashes', async () => {
    adapter.setBehavior({ exitCode: 7, error: 'boom' });
    const logger = createLogger('normal');

    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'crashed');
    assert.equal(outcomeLine(stderr, '1'), 'task 1 dead (reason: crashed, code: 7)');
    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: crashed'));
  });

  it('logs a no_result dead line when the agent writes no result', async () => {
    adapter.setBehavior({ writeResult: false });
    const logger = createLogger('normal');

    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'no_result');
    assert.equal(outcomeLine(stderr, '1'), 'task 1 dead (reason: no_result)');
    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: no_result'));
  });

  it('logs a spec_conflict dead line when the folder changes after approval', async () => {
    await fs.appendFile(path.join(specFolder, 'tasks', '1.md'), '\n<!-- tampered -->\n', 'utf8');
    const logger = createLogger('normal');

    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'spec_conflict');
    assert.equal(outcomeLine(stderr, '1'), 'task 1 dead (reason: spec_conflict)');
    const deadContent = await fs.readFile(path.join(specFolder, '.run', 'dead', '1.md'), 'utf8');
    assert.ok(deadContent.includes('reason: spec_conflict'));
  });

  it('logs an already_running dead line when the task lock is held', async () => {
    await acquireLock(path.join(specFolder, '.run'), '1');
    const logger = createLogger('normal');

    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'already_running');
    assert.equal(outcomeLine(stderr, '1'), 'task 1 dead (reason: already_running)');
  });

  it('does not log an outcome line when no logger is supplied', async () => {
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
      assert.equal(result.success, true);
    });

    assert.equal(outcomeLine(stderr, '1'), undefined);
  });
});
