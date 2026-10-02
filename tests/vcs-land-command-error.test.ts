import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { type LandCommandOptions, landCommand } from '../src/cli/land.js';
import { type MessageCommandOptions, messageCommand } from '../src/cli/message.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { STALE_BUILD_MESSAGE } from '../src/watcher/build.js';
import { runCliCaptured } from './cli-capture.js';

const execFileAsync = promisify(execFile);
const REFUSAL = 'No archived change "999" in an osq worktree';
const CONFIG_SOURCE =
  "export default { vcs: { enabled: true, author: 'Osq <osq@example.invalid>' } };\n";
const CONFIG: OsqConfig = defineConfig({
  vcs: { enabled: true, author: 'Osq <osq@example.invalid>' },
});

const STALE_TIME = new Date('2024-01-01T00:00:00Z');
const FRESH_TIME = new Date('2030-01-01T00:00:00Z');
const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) {
    Reflect.deleteProperty(env, key);
  }
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

/** A scaffolded git repository with vcs enabled, holding no archived change. */
async function makeProject(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-land-command-error-'));
  tmpDirs.push(root);
  await scaffoldProject(root);
  await fs.writeFile(path.join(root, 'osq.config.ts'), CONFIG_SOURCE, 'utf8');
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'seed'], root);
  return root;
}

/** A package root whose `src/` is newer than its `dist/`. */
async function makeStalePackage(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-land-stale-package-'));
  tmpDirs.push(root);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  const srcFile = path.join(root, 'src', 'index.ts');
  const distFile = path.join(root, 'dist', 'index.js');
  await fs.writeFile(srcFile, 'source\n', 'utf8');
  await fs.writeFile(distFile, 'compiled\n', 'utf8');
  await fs.utimes(distFile, STALE_TIME, STALE_TIME);
  await fs.utimes(srcFile, FRESH_TIME, FRESH_TIME);
  return root;
}

interface DirectCapture {
  readonly stdout: string;
  readonly stderr: string;
  readonly error: unknown;
}

/** Call `landCommand` directly, capturing both streams and any thrown error. */
async function directLand(root: string, id: string, packageRoot?: string): Promise<DirectCapture> {
  let stdout = '';
  let stderr = '';
  let error: unknown;
  try {
    await landCommand(id, {
      cwd: root,
      config: CONFIG,
      ...(packageRoot === undefined ? {} : { packageRoot }),
      stdout: (msg) => {
        stdout += msg;
      },
      stderr: (msg) => {
        stderr += msg;
      },
    });
  } catch (caught) {
    error = caught;
  }
  return { stdout, stderr, error };
}

/** Call `messageCommand` directly, capturing both streams and any thrown error. */
async function directMessage(root: string, id: string): Promise<DirectCapture> {
  let stdout = '';
  let stderr = '';
  let error: unknown;
  try {
    await messageCommand(id, {
      cwd: root,
      config: CONFIG,
      stdout: (msg) => {
        stdout += msg;
      },
      stderr: (msg) => {
        stderr += msg;
      },
    });
  } catch (caught) {
    error = caught;
  }
  return { stdout, stderr, error };
}

describe('land and message command errors', () => {
  it('LandCommandOptions and MessageCommandOptions have no exit option', () => {
    // @ts-expect-error `exit` was removed from `LandCommandOptions`.
    const land: LandCommandOptions = { exit: () => {} };
    // @ts-expect-error `exit` was removed from `MessageCommandOptions`.
    const message: MessageCommandOptions = { exit: () => {} };
    assert.ok(land);
    assert.ok(message);
  });

  it('landCommand rejects with the refusal line, prints nothing, and leaves the exit code alone', async () => {
    const root = await makeProject();
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    let capture: DirectCapture;
    try {
      capture = await directLand(root, '999');
      assert.equal(process.exitCode, undefined, 'the command must not set process.exitCode');
    } finally {
      process.exitCode = originalExitCode;
    }

    const error = capture.error;
    assert.ok(error instanceof CommandError, `expected a CommandError, got ${String(error)}`);
    assert.equal(error.name, 'CommandError');
    assert.equal(error.message, REFUSAL);
    assert.equal(error.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, '');
  });

  it('landCommand rejects with the stale-build line without printing it', async () => {
    const root = await makeProject();
    const packageRoot = await makeStalePackage();

    const capture = await directLand(root, '999', packageRoot);

    const error = capture.error;
    assert.ok(error instanceof CommandError, `expected a CommandError, got ${String(error)}`);
    assert.equal(error.message, STALE_BUILD_MESSAGE);
    assert.equal(error.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, '');
  });

  it('messageCommand rejects with the refusal line and prints nothing', async () => {
    const root = await makeProject();
    const originalExitCode = process.exitCode;
    process.exitCode = undefined;
    let capture: DirectCapture;
    try {
      capture = await directMessage(root, '999');
      assert.equal(process.exitCode, undefined, 'the command must not set process.exitCode');
    } finally {
      process.exitCode = originalExitCode;
    }

    const error = capture.error;
    assert.ok(error instanceof CommandError, `expected a CommandError, got ${String(error)}`);
    assert.equal(error.message, REFUSAL);
    assert.equal(error.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, '');
  });

  it('prints the land refusal on stderr and exits 1 through runCli', async () => {
    const root = await makeProject();

    const capture = await runCliCaptured(root, ['land', '999']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [{ stream: 'stderr', text: REFUSAL }]);
  });

  it('prints the message refusal on stderr and exits 1 through runCli', async () => {
    const root = await makeProject();

    const capture = await runCliCaptured(root, ['message', '999']);

    assert.equal(capture.exitCode, 1);
    assert.deepEqual(capture.lines, [{ stream: 'stderr', text: REFUSAL }]);
  });
});
