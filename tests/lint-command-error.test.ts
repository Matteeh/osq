import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { lintCommand } from '../src/cli/lint.js';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { type NewSpecResult, createNewSpec } from '../src/core/foundation/new.js';
import { runCliCaptured } from './cli-capture.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';

const silentLogger = {
  info: () => {},
  verbose: () => {},
  warn: () => {},
  error: () => {},
};

/** Create a change whose proposal runs the local verifier and whose task runs `verify`. */
async function createChange(root: string, title: string, verify: string): Promise<NewSpecResult> {
  const spec = await createNewSpec(root, title);
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');

  const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8');
  await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, `verify: ${verify}`), 'utf8');

  return spec;
}

describe('lint command errors', () => {
  let root: string;
  let valid: NewSpecResult;
  let invalid: NewSpecResult;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-lint-command-error-'));
    await installFakeValidator(root);
    await scaffoldProject(root);
    await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
    valid = await createChange(root, 'Valid Change', VERIFY);
    invalid = await createChange(root, 'Invalid Change', '');
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('rejects with an empty CommandError after printing findings, and leaves the exit code alone', async () => {
    const logged: string[] = [];
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    try {
      await assert.rejects(
        lintCommand([invalid.specId], {
          cwd: root,
          config: DEFAULT_CONFIG,
          logger: { ...silentLogger, error: (message: string) => logged.push(message) },
        }),
        (error: unknown) => {
          assert.ok(error instanceof CommandError, `expected a CommandError, got ${String(error)}`);
          assert.equal(error.name, 'CommandError');
          assert.equal(error.message, '');
          assert.equal(error.exitCode, 1);
          return true;
        },
      );
      assert.equal(process.exitCode, undefined, 'the command must not set process.exitCode');
    } finally {
      process.exitCode = originalExitCode;
    }
    assert.ok(
      logged.some((line) => line.includes('verify command is empty')),
      JSON.stringify(logged),
    );
  });

  it('returns the result for a valid change', async () => {
    const result = await lintCommand([valid.specId], {
      cwd: root,
      config: DEFAULT_CONFIG,
      logger: silentLogger,
    });

    assert.equal(result.valid, true, JSON.stringify(result.entries));
    assert.equal(result.entries.length, 1);
  });

  it('prints the finding and exits 1 through the CLI for an invalid change', async () => {
    const capture = await runCliCaptured(root, ['lint', invalid.specId]);

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.ok(capture.stderr.includes('verify command is empty'), JSON.stringify(capture.stderr));
  });

  it('exits 0 through the CLI for a valid change', async () => {
    const capture = await runCliCaptured(root, ['lint', valid.specId]);

    assert.equal(capture.exitCode ?? 0, 0, JSON.stringify(capture.lines));
  });
});
