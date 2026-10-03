import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { rejectCommand } from '../src/cli/reject.js';
import { retryCommand } from '../src/cli/retry.js';
import { type OsqConfig, loadConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { createNewSpec } from '../src/core/foundation/new.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { runCliCaptured } from './cli-capture.js';
import { installFakeValidator } from './helpers.js';

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tempProject(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(root);
  return root;
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

/** Reset `root` to a fresh draft change and return its loaded config. */
async function buildReject(root: string): Promise<OsqConfig> {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  await installFakeValidator(root);
  await scaffoldProject(root);
  await createNewSpec(root, 'Reject Lifecycle');
  return loadConfig(root);
}

/** Reset `root` to a fresh approved change with one dead task and return its config. */
async function buildRetry(root: string): Promise<OsqConfig> {
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  await installFakeValidator(root);
  await scaffoldProject(root);
  const spec = await createNewSpec(root, 'Retry Lifecycle');
  await fs.writeFile(path.join(root, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  for (const rel of ['proposal.md', path.join('tasks', '1.md')]) {
    const target = path.join(spec.folderPath, rel);
    const content = await fs.readFile(target, 'utf8');
    await fs.writeFile(target, content.replace(/^verify:.*$/m, 'verify: node verify.cjs'), 'utf8');
  }
  const config = await loadConfig(root);
  await approveSpec(root, '001', config);
  const deadDir = path.join(spec.folderPath, '.run', 'dead');
  await fs.mkdir(deadDir, { recursive: true });
  await fs.writeFile(path.join(deadDir, '1.md'), '---\nreason: verify_red\n---\ndead\n', 'utf8');
  return config;
}

describe('command inputs for reject and retry', () => {
  it('osq reject prints the same text directly and through runCli', async () => {
    const root = await tempProject('osq-command-inputs-reject-');

    await buildReject(root);
    const cli = await runCliCaptured(root, ['reject', '001', '--reason', 'stop']);
    assert.equal(cli.exitCode, undefined);

    const config = await buildReject(root);
    const direct = await captureDirect((writers) =>
      rejectCommand('001', { cwd: root, config, reason: 'stop', ...writers }),
    );

    assert.equal(direct.stdout, cli.stdout);
    assert.equal(direct.stderr, cli.stderr);
    assert.match(direct.stdout, /^Rejected 001 \(001-reject-lifecycle\)\n/);
    assert.equal(direct.stderr, '');
  });

  it('osq retry prints the same text directly and through runCli', async () => {
    const root = await tempProject('osq-command-inputs-retry-');

    await buildRetry(root);
    const cli = await runCliCaptured(root, ['retry', '001', '1']);
    assert.equal(cli.exitCode, undefined);

    const config = await buildRetry(root);
    const direct = await captureDirect((writers) =>
      retryCommand('001', '1', { cwd: root, config, ...writers }),
    );

    assert.equal(direct.stdout, cli.stdout);
    assert.equal(direct.stderr, cli.stderr);
    assert.match(direct.stdout, /^Retried 001 task 1 \(next attempt: 2\)\n/);
    assert.equal(direct.stderr, '');
  });
});
