import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { approveSpec } from '../src/core/approve.js';
import { DEFAULT_CONFIG } from '../src/core/config.js';
import { scaffoldProject } from '../src/core/init.js';
import { acquireLock } from '../src/core/lock.js';
import { createLogger } from '../src/core/logger.js';
import { createNewSpec } from '../src/core/new.js';
import { MockAdapter } from '../src/harness/mock.js';
import type * as outcomeTypes from '../src/watcher/outcome.js';
import {
  formatTaskOutcomeLine,
  recordDeadEvent,
  recordDoneEvent,
  recordLifecycleEvent,
  tickTaskCheckbox,
  tickTaskCheckboxContent,
} from '../src/watcher/outcome.js';
import * as runner from '../src/watcher/runner.js';
import { runTask } from '../src/watcher/runner.js';
import { installFakeValidator } from './helpers.js';

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

/**
 * Every line that looks like a terminal task outcome, regardless of symbol or
 * word prefix. Duplicate logging shows up here as `length > 1`.
 */
function outcomeLines(stderr: string, taskNumber: string): string[] {
  return stderr
    .split('\n')
    .filter(
      (line) =>
        line.includes(`task ${taskNumber} verified`) ||
        line.includes(`task ${taskNumber} dead (reason:`),
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
    await installFakeValidator(tmpDir);
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

  it('does not export the legacy formatTaskOutcomeSummary helper', () => {
    assert.equal('formatTaskOutcomeSummary' in runner, false);
  });

  describe('formatTaskOutcomeLine', () => {
    it('renders a verified line with elapsed time and no (passed) suffix', () => {
      const line = formatTaskOutcomeLine('1', true, undefined, 1.5, false);
      assert.equal(line, '[ok] task 1 verified (elapsed: 1.5s)');
      assert.ok(!line.includes('(passed)'));
    });

    it('renders unicode symbols when enabled', () => {
      assert.equal(
        formatTaskOutcomeLine('1', true, undefined, 1.5, true),
        '✓ task 1 verified (elapsed: 1.5s)',
      );
      assert.equal(
        formatTaskOutcomeLine('1', false, 'crashed', 1.5, true),
        '✗ task 1 dead (reason: crashed, elapsed: 1.5s)',
      );
    });

    it('renders a dead line for every failure reason', () => {
      const reasons = [
        'spec_conflict',
        'already_running',
        'crashed',
        'timeout',
        'no_result',
        'verify_red',
      ] as const;

      for (const reason of reasons) {
        assert.equal(
          formatTaskOutcomeLine('7', false, reason, 2, false),
          `[dead] task 7 dead (reason: ${reason}, elapsed: 2s)`,
        );
      }
    });

    it('appends the detail string before the elapsed time', () => {
      assert.equal(
        formatTaskOutcomeLine('7', false, 'crashed', 2, false, 'code: 7'),
        '[dead] task 7 dead (reason: crashed, code: 7, elapsed: 2s)',
      );
      assert.equal(
        formatTaskOutcomeLine('7', false, 'verify_red', 2, false, 'timed_out: true'),
        '[dead] task 7 dead (reason: verify_red, timed_out: true, elapsed: 2s)',
      );
    });

    it('produces a single line for every outcome', () => {
      const lines = [
        formatTaskOutcomeLine('1', true, undefined, 0, false),
        formatTaskOutcomeLine('1', false, 'spec_conflict', 0, false),
        formatTaskOutcomeLine('1', false, 'already_running', 0, false),
        formatTaskOutcomeLine('1', false, 'crashed', 0, false, 'code: 7'),
        formatTaskOutcomeLine('1', false, 'timeout', 0, false),
        formatTaskOutcomeLine('1', false, 'no_result', 0, false),
        formatTaskOutcomeLine('1', false, 'verify_red', 0, false, 'timed_out: true'),
      ];

      for (const line of lines) {
        assert.ok(!line.includes('\n'), `expected single line, got ${JSON.stringify(line)}`);
      }
    });
  });

  it('logs exactly one verified line upon successful verification', async () => {
    const logger = createLogger('normal');

    let success = false;
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      success = result.success;
    });

    assert.equal(success, true);
    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 verified \(elapsed: [\d.]+s\)/);
    assert.ok(!stderr.includes('(passed)'));
  });

  it('logs exactly one dead line and writes the marker upon verification failure', async () => {
    await writeTask(specFolder, 'node -e "process.exit(1)"');
    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);

    const logger = createLogger('normal');
    let reason = '';
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter, logger);
      reason = result.reason ?? '';
    });

    assert.equal(reason, 'verify_red');
    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 dead \(reason: verify_red, elapsed: [\d.]+s\)/);
    assert.ok(!stderr.includes('(passed)'));

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

    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 dead \(reason: verify_red, timed_out: true, elapsed: [\d.]+s\)/);
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
    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 dead \(reason: timeout, elapsed: [\d.]+s\)/);
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
    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 dead \(reason: crashed, code: 7, elapsed: [\d.]+s\)/);
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
    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 dead \(reason: no_result, elapsed: [\d.]+s\)/);
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
    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 dead \(reason: spec_conflict, elapsed: [\d.]+s\)/);
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
    const lines = outcomeLines(stderr, '1');
    assert.equal(lines.length, 1);
    assert.match(lines[0], /task 1 dead \(reason: already_running, elapsed: [\d.]+s\)/);
  });

  it('does not log an outcome line when no logger is supplied', async () => {
    const stderr = await captureStderr(async () => {
      const result = await runTask(tmpDir, specFolder, '1', DEFAULT_CONFIG, adapter);
      assert.equal(result.success, true);
    });

    assert.equal(outcomeLines(stderr, '1').length, 0);
  });
});

describe('Outcome module shape', () => {
  it('exposes the outcome failure types and formatter', () => {
    const reason: outcomeTypes.RunTaskFailureReason = 'undeclared_test_change';
    const result: outcomeTypes.RunTaskResult = { success: false, reason };
    assert.equal(result.reason, 'undeclared_test_change');
    assert.equal(typeof formatTaskOutcomeLine, 'function');
  });

  it('exposes the lifecycle, dead, done, and checkbox writers', () => {
    for (const fn of [
      recordLifecycleEvent,
      recordDeadEvent,
      recordDoneEvent,
      tickTaskCheckboxContent,
      tickTaskCheckbox,
    ]) {
      assert.equal(typeof fn, 'function');
    }
  });

  it('keeps outcome.ts under 200 lines', async () => {
    const source = await fs.readFile(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'watcher', 'outcome.ts'),
      'utf8',
    );
    const lineCount = source.replace(/\n$/, '').split('\n').length;
    assert.ok(lineCount < 200, `outcome.ts must be under 200 lines, found ${lineCount}`);
  });
});
