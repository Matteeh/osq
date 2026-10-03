import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { graphCommand } from '../src/cli/graph.js';
import { landCommand } from '../src/cli/land.js';
import { messageCommand } from '../src/cli/message.js';
import { specCommand } from '../src/cli/spec.js';
import { syncCommand } from '../src/cli/sync.js';
import { defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { OSQ_SYNC_NEEDS_GIT } from '../src/core/vcs/sync-change.js';
import { runCliCaptured } from './cli-capture.js';

const execFileAsync = promisify(execFile);
const VCS_ON = defineConfig({ vcs: { enabled: true, author: 'Osq <osq@example.invalid>' } });
const VCS_OFF = defineConfig({ vcs: { enabled: false } });
const CONFIG_SOURCE =
  "export default { vcs: { enabled: true, author: 'Osq <osq@example.invalid>' } };\n";
const REFUSAL = 'No archived change "999" in an osq worktree';

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

async function write(root: string, relative: string, content: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, content, 'utf8');
}

function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

/** A git repository with a seed commit and no `osq.config.ts`. */
async function emptyRepo(): Promise<string> {
  const root = await tempDir('osq-command-inputs-vcs-');
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await write(root, 'README.md', 'seed\n');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  return root;
}

function capabilitySpec(name: string): string {
  return [
    `# ${name} Specification`,
    '',
    '## Purpose',
    `${name} purpose.`,
    '',
    '## Requirements',
    '',
    `### Requirement: ${name} rule`,
    `The ${name} rule SHALL hold.`,
    '',
    `#### Scenario: ${name} holds`,
    `- **WHEN** ${name} runs`,
    '- **THEN** it holds',
    '',
  ].join('\n');
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

/** Compare one command's direct output with its `runCli` output in `cwd`. */
async function assertSame(
  cwd: string,
  argv: readonly string[],
  run: (writers: Writers) => Promise<unknown>,
): Promise<Captured> {
  const cli = await runCliCaptured(cwd, argv);
  assert.equal(cli.exitCode, undefined, `osq ${argv.join(' ')} exited nonzero`);
  const direct = await captureDirect(run);
  assert.equal(direct.stdout, cli.stdout, `stdout differs for osq ${argv.join(' ')}`);
  assert.equal(direct.stderr, cli.stderr, `stderr differs for osq ${argv.join(' ')}`);
  return direct;
}

/** Assert a promise rejects and return the `CommandError` it carries. */
async function rejectCommand(promise: Promise<unknown>): Promise<CommandError> {
  let caught: unknown;
  await assert.rejects(promise, (error: unknown) => {
    caught = error;
    return true;
  });
  assert.ok(caught instanceof CommandError, `expected a CommandError, got ${String(caught)}`);
  return caught;
}

describe('command inputs for graph and spec', () => {
  it('osq graph prints the same text directly and through runCli', async () => {
    const root = await tempDir('osq-command-inputs-graph-');
    await write(root, 'openspec/specs/alpha/spec.md', capabilitySpec('alpha'));
    const config = await loadConfig(root);

    const direct = await assertSame(root, ['graph'], (writers) =>
      graphCommand({ cwd: root, config, ...writers }),
    );

    assert.match(direct.stdout, /^Nodes: /);
    assert.equal(direct.stderr, '');
  });

  it('osq graph --json prints the same text directly and through runCli', async () => {
    const root = await tempDir('osq-command-inputs-graph-json-');
    await write(root, 'openspec/specs/alpha/spec.md', capabilitySpec('alpha'));
    const config = await loadConfig(root);

    const direct = await assertSame(root, ['graph', '--json'], (writers) =>
      graphCommand({ cwd: root, config, json: true, ...writers }),
    );

    assert.equal((JSON.parse(direct.stdout) as { nodes: unknown[] }).nodes.length > 0, true);
    assert.equal(direct.stderr, '');
  });

  it('osq spec lists capabilities the same way directly and through runCli', async () => {
    const root = await tempDir('osq-command-inputs-spec-');
    await write(root, 'openspec/specs/alpha/spec.md', capabilitySpec('alpha'));
    await write(root, 'openspec/specs/beta/spec.md', capabilitySpec('beta'));
    const config = await loadConfig(root);

    const direct = await assertSame(root, ['spec'], (writers) =>
      specCommand(undefined, undefined, { cwd: root, config, ...writers }),
    );

    assert.equal(direct.stdout, 'alpha\nbeta\n');
    assert.equal(direct.stderr, '');
  });

  it('osq spec <capability> lists requirements the same way directly and through runCli', async () => {
    const root = await tempDir('osq-command-inputs-spec-capability-');
    await write(root, 'openspec/specs/alpha/spec.md', capabilitySpec('alpha'));
    const config = await loadConfig(root);

    const direct = await assertSame(root, ['spec', 'alpha'], (writers) =>
      specCommand('alpha', undefined, { cwd: root, config, ...writers }),
    );

    assert.equal(direct.stdout, 'alpha rule\n');
    assert.equal(direct.stderr, '');
  });
});

describe('command inputs for land, message, and sync', () => {
  it('sync uses the passed config and rejects with its refusal', async () => {
    const root = await emptyRepo();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const error = await rejectCommand(
      syncCommand('001', {
        cwd: root,
        config: VCS_OFF,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      }),
    );

    assert.equal(error.message, OSQ_SYNC_NEEDS_GIT);
    assert.equal(stdout.join(''), '');
    assert.equal(stderr.join(''), '');
  });

  it('message and land use the passed config and match runCli on an unknown id', async () => {
    const root = await emptyRepo();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const writers: Writers = {
      stdout: (text) => stdout.push(text),
      stderr: (text) => stderr.push(text),
    };

    const messageError = await rejectCommand(
      messageCommand('999', { cwd: root, config: VCS_ON, ...writers }),
    );
    const landError = await rejectCommand(
      landCommand('999', {
        cwd: root,
        config: VCS_ON,
        allowStale: true,
        packageRoot: root,
        ...writers,
      }),
    );

    assert.equal(messageError.message, REFUSAL);
    assert.equal(landError.message, REFUSAL);
    assert.equal(stdout.join(''), '');
    assert.equal(stderr.join(''), '');

    await write(root, 'osq.config.ts', CONFIG_SOURCE);
    const messageCli = await runCliCaptured(root, ['message', '999']);
    const landCli = await runCliCaptured(root, ['land', '999']);

    assert.equal(messageCli.exitCode, 1);
    assert.equal(messageCli.stderr, `${messageError.message}\n`);
    assert.equal(landCli.exitCode, 1);
    assert.equal(landCli.stderr, `${landError.message}\n`);
  });
});
