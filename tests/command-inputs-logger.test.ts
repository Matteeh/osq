import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { CommandError } from '../src/cli/command-error.js';
import { lintCommand } from '../src/cli/lint.js';
import { migrateCommand } from '../src/cli/migrate.js';
import { watchCommand } from '../src/cli/watch.js';
import { defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { type NewSpecResult, createNewSpec } from '../src/core/foundation/new.js';
import { runCliCaptured } from './cli-capture.js';
import { installFakeValidator } from './helpers.js';

const VERIFY = 'node verify.cjs';
// The mock harness declares no external executable, so the watcher's preflight
// port is not invoked and an empty project stays quiet.
const WATCH_CONFIG = defineConfig({ vcs: { enabled: false }, harness: 'mock' });

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempDir(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
}

/** A scaffolded project with a local verifier and one invalid change. */
async function invalidProject(): Promise<{ root: string; specId: string }> {
  const root = await tempDir('osq-command-inputs-logger-');
  await installFakeValidator(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');

  const spec: NewSpecResult = await createNewSpec(root, 'Invalid Change');
  const proposalPath = path.join(spec.folderPath, 'proposal.md');
  const proposal = await fs.readFile(proposalPath, 'utf8');
  await fs.writeFile(proposalPath, proposal.replace(/^verify:.*$/m, `verify: ${VERIFY}`), 'utf8');
  const taskPath = path.join(spec.folderPath, 'tasks', '1.md');
  const task = await fs.readFile(taskPath, 'utf8');
  await fs.writeFile(taskPath, task.replace(/^verify:.*$/m, 'verify: '), 'utf8');

  return { root, specId: spec.specId };
}

interface Writers {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface Captured {
  readonly stdout: string;
  readonly stderr: string;
}

/** Run `run` with appending writers, proving no byte reaches the process streams. */
async function captureDirect(run: (writers: Writers) => Promise<unknown>): Promise<Captured> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const leaked: string[] = [];
  const originalStdout = process.stdout.write;
  const originalStderr = process.stderr.write;
  const record = (chunk: string | Uint8Array): boolean => {
    leaked.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stdout.write = record as typeof process.stdout.write;
  process.stderr.write = record as typeof process.stderr.write;
  try {
    await run({ stdout: (text) => stdout.push(text), stderr: (text) => stderr.push(text) });
  } finally {
    process.stdout.write = originalStdout;
    process.stderr.write = originalStderr;
  }
  assert.deepEqual(leaked, [], 'the direct call wrote to a process stream');
  return { stdout: stdout.join(''), stderr: stderr.join('') };
}

/** Assert a promise rejects with a `CommandError` and return it. */
async function rejectCommand(promise: Promise<unknown>): Promise<CommandError> {
  let caught: unknown;
  await assert.rejects(promise, (error: unknown) => {
    caught = error;
    return true;
  });
  assert.ok(caught instanceof CommandError, `expected a CommandError, got ${String(caught)}`);
  return caught;
}

describe('command inputs for lint and migrate', () => {
  it('osq lint <id> logs the same stderr directly and through runCli', async () => {
    const { root, specId } = await invalidProject();
    const config = await loadConfig(root);

    const cli = await runCliCaptured(root, ['lint', specId]);
    const direct = await captureDirect(async (writers) => {
      await rejectCommand(lintCommand([specId], { cwd: root, config, ...writers }));
    });

    assert.equal(cli.exitCode, 1);
    assert.equal(cli.stdout, '');
    assert.equal(direct.stdout, cli.stdout, 'stdout differs for osq lint <id>');
    assert.equal(direct.stderr, cli.stderr, 'stderr differs for osq lint <id>');
    assert.ok(direct.stderr.includes('verify command is empty'), direct.stderr);
  });

  it('osq lint --json writes the document plus a newline to stdout, matching runCli', async () => {
    const { root, specId } = await invalidProject();
    const config = await loadConfig(root);

    const cli = await runCliCaptured(root, ['lint', '--json', specId]);
    const direct = await captureDirect(async (writers) => {
      await rejectCommand(lintCommand([specId], { cwd: root, config, json: true, ...writers }));
    });

    assert.equal(cli.exitCode, 1);
    assert.equal(direct.stdout, cli.stdout, 'stdout differs for osq lint --json');
    assert.equal(direct.stderr, '');
    assert.ok(direct.stdout.endsWith('\n'), direct.stdout);
    const document = JSON.parse(direct.stdout) as { valid: boolean; changes: unknown[] };
    assert.equal(document.valid, false);
    assert.equal(document.changes.length, 1);
  });

  it('osq migrate legacy logs the same stderr directly and through runCli', async () => {
    const { root } = await invalidProject();
    const config = await loadConfig(root);

    const cli = await runCliCaptured(root, ['migrate', 'legacy']);
    const direct = await captureDirect(async (writers) => {
      await rejectCommand(migrateCommand('legacy', { cwd: root, config, ...writers }));
    });

    assert.equal(cli.exitCode, 1);
    assert.equal(cli.stdout, '');
    assert.equal(direct.stdout, cli.stdout, 'stdout differs for osq migrate legacy');
    assert.equal(direct.stderr, cli.stderr, 'stderr differs for osq migrate legacy');
    assert.ok(direct.stderr.includes('unsupported migrate target'), direct.stderr);
  });
});

describe('command inputs for watch', () => {
  it('watchCommand with nothing to run writes nothing to the process streams', async () => {
    const root = await tempDir('osq-command-inputs-watch-');
    await scaffoldProject(root);
    const stderr: string[] = [];

    const leaked: string[] = [];
    const originalStdout = process.stdout.write;
    const originalStderr = process.stderr.write;
    const record = (chunk: string | Uint8Array): boolean => {
      leaked.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    };
    process.stdout.write = record as typeof process.stdout.write;
    process.stderr.write = record as typeof process.stderr.write;
    try {
      await watchCommand({
        once: true,
        allowStale: true,
        cwd: root,
        config: WATCH_CONFIG,
        stderr: (text) => stderr.push(text),
      });
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
    }

    assert.deepEqual(leaked, [], 'watchCommand wrote to a process stream');
    assert.deepEqual(stderr, []);
  });
});
