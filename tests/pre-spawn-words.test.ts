import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { formatPreSpawnStart } from '../src/core/status/pre-spawn-words.js';
import { MockAdapter } from '../src/harness/mock.js';
import { runWatcherCycle } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const PASS_VERIFY = 'node pass.cjs';
const FAIL_VERIFY = 'node fail.cjs';
const EXISTING_TEST = 'tests/old.test.ts';
const MISSING_TEST = 'tests/new.test.ts';
const MISSING_PATHS_VERIFY = `node pass.cjs ${EXISTING_TEST} ${MISSING_TEST}`;

const PASS_SCRIPT = 'process.exit(0);\n';
const FAIL_SCRIPT = "console.error('verify exploded');\nprocess.exit(3);\n";

/** Logger capturing the permanent lines a watcher cycle emits. */
class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];

  info(msg: string): void {
    this.infos.push(msg);
  }

  verbose(_msg: string): void {}

  warn(msg: string): void {
    this.warns.push(msg);
  }

  error(_msg: string): void {}

  status(_text: string): void {}

  clearStatus(): void {}
}

describe('formatPreSpawnStart wording', () => {
  it('words a failing verify as a red start', () => {
    assert.equal(formatPreSpawnStart('red', 1, []), 'started red: verify fails');
  });

  it('words missing named paths as a red start naming them in order', () => {
    assert.equal(
      formatPreSpawnStart('red', 0, ['tests/a.test.ts', 'tests/b.test.ts']),
      'started red: tests/a.test.ts, tests/b.test.ts missing',
    );
  });

  it('words a passing verify as a green start', () => {
    assert.equal(formatPreSpawnStart('green', 0, []), 'started green, as declared');
    assert.equal(formatPreSpawnStart('any', 0, []), 'started green, as declared');
  });

  it('appends the declaration on a red start declared green', () => {
    assert.equal(
      formatPreSpawnStart('green', 1, []),
      'started red: verify fails, but it declared green',
    );
  });

  it('appends the declaration on a green start declared red', () => {
    assert.equal(formatPreSpawnStart('red', 0, []), 'started green, but it declared red');
  });

  it('appends the declaration after a missing-path red start', () => {
    assert.equal(
      formatPreSpawnStart('green', 0, ['tests/x.test.ts']),
      'started red: tests/x.test.ts missing, but it declared green',
    );
  });

  it('never appends a declaration for an any start', () => {
    assert.equal(formatPreSpawnStart('any', 1, []), 'started red: verify fails');
    assert.equal(formatPreSpawnStart('any', 0, []), 'started green, as declared');
  });
});

describe('pre-spawn start log line', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-pre-spawn-words-'));
    await installFakeValidator(tmpDir);
    await scaffoldProject(tmpDir);
    await fs.writeFile(path.join(tmpDir, 'pass.cjs'), PASS_SCRIPT, 'utf8');
    await fs.writeFile(path.join(tmpDir, 'fail.cjs'), FAIL_SCRIPT, 'utf8');
    await fs.mkdir(path.join(tmpDir, 'tests'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, EXISTING_TEST), '// existing test\n', 'utf8');
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  /** Approve one change whose task carries the given verify, then run a cycle. */
  async function runCycle(
    taskVerify: string,
    verifyStarts?: 'red' | 'green' | 'any',
  ): Promise<CaptureLogger> {
    const spec = await createNewSpec(tmpDir, 'Pre Spawn Words');
    const proposalPath = path.join(spec.folderPath, 'proposal.md');
    const proposal = await fs.readFile(proposalPath, 'utf8');
    await fs.writeFile(
      proposalPath,
      proposal.replace(/^verify:\s*.*$/m, `verify: ${PASS_VERIFY}`),
      'utf8',
    );

    const lines = [
      '---',
      'title: When a task starts, the pre-spawn check runs',
      `verify: ${taskVerify}`,
      'scope: []',
      'entry: []',
      'skills: []',
    ];
    if (verifyStarts) lines.push(`verify_starts: ${verifyStarts}`);
    lines.push('---', '## Acceptance', '- [ ] pre-spawn check runs');
    await fs.writeFile(
      path.join(spec.folderPath, 'tasks', '1.md'),
      `${lines.join('\n')}\n`,
      'utf8',
    );

    await approveSpec(tmpDir, '001', DEFAULT_CONFIG);
    const logger = new CaptureLogger();
    await runWatcherCycle(tmpDir, DEFAULT_CONFIG, new MockAdapter(), logger);
    return logger;
  }

  function taskLines(logger: CaptureLogger): string[] {
    return [...logger.infos, ...logger.warns].filter((line) => line.startsWith('task 1 '));
  }

  it('logs a named missing test file as a red start', async () => {
    const logger = await runCycle(MISSING_PATHS_VERIFY);
    assert.ok(
      taskLines(logger).includes(`task 1 started red: ${MISSING_TEST} missing`),
      `expected the missing-path line, got: ${JSON.stringify(taskLines(logger))}`,
    );
  });

  it('logs a failing verify as a red start at info level', async () => {
    const logger = await runCycle(FAIL_VERIFY);
    assert.ok(
      logger.infos.includes('task 1 started red: verify fails'),
      `expected the red-start info line, got: ${JSON.stringify(logger.infos)}`,
    );
    assert.equal(logger.warns.includes('task 1 started red: verify fails'), false);
  });

  it('logs a declared green start that passes as declared', async () => {
    const logger = await runCycle(PASS_VERIFY, 'green');
    assert.ok(
      logger.infos.includes('task 1 started green, as declared'),
      `expected the green-start line, got: ${JSON.stringify(logger.infos)}`,
    );
  });

  it('warns for a passing verify declared red', async () => {
    const logger = await runCycle(PASS_VERIFY, 'red');
    assert.ok(
      logger.warns.includes('task 1 started green, but it declared red'),
      `expected the mismatch warning, got: ${JSON.stringify(logger.warns)}`,
    );
  });
});
