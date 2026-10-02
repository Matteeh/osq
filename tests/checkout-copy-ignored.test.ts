import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { landCommand } from '../src/cli/land.js';
import { messageCommand } from '../src/cli/message.js';
import { statusCommand } from '../src/cli/status.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.posix.join(CHANGES, 'archive');
const ORDERS = path.posix.join('openspec', 'specs', 'orders', 'spec.md');
const FOLDER = '001-order-flow';
const BRANCH = `osq/${FOLDER}`;

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** The test's own git calls ignore redirecting variables, like osq's reads. */
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

/** Run `git <args>` feeding `input` on stdin, returning stdout. */
function gitWithInput(args: string[], cwd: string, input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, env: cleanGitEnv() });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${err}`));
    });
    child.stdin.end(input);
  });
}

async function exists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

const ORDERS_SPEC = `# orders Specification

## Purpose

Orders are totalled.

## Requirements

### Requirement: Order totals
The system SHALL total orders.

#### Scenario: Totals
- **WHEN** an order arrives
- **THEN** it is totalled
`;

const ADD_001 = `# Spec Delta: orders

## Purpose

Adds order 001.

## ADDED Requirements

### Requirement: Order 001
The system SHALL add order 001.

#### Scenario: 001 runs
- **WHEN** 001 runs
- **THEN** order 001 is added
`;

const PROPOSAL = `---
title: Order Flow
depends_on: []
verify: node verify.cjs
features:
  reads: []
---

## Goal

Run the tasks.

## Surface

None.

## Human steps

None
`;

const TASK = `---
title: Only task
verify: node verify.cjs
scope: ["src/one.txt"]
entry: []
skills: []
---

## Acceptance

- [ ] does the thing
`;

/** Write the change's authored files under `folderPath`. */
async function writeChange(folderPath: string): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), '# Tasks\n\n- [ ] 1. Only task\n', 'utf8');
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), TASK, 'utf8');
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), ADD_001);
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.writeFile(
      path.join(options.projectRoot, options.scope[0] ?? 'src/one.txt'),
      `task ${options.taskNumber}\n`,
      'utf8',
    );
    const resultsDir = path.join(options.specFolderPath, '.run', 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.writeFile(
      path.join(resultsDir, `${options.taskNumber}.md`),
      '# Agent result\n',
      'utf8',
    );
    return { exitCode: 0 };
  }
}

interface Project {
  readonly repo: string;
  readonly worktree: string;
  readonly config: OsqConfig;
}

/** A committed temp repository with the one change approved into a worktree. */
async function setupProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-checkout-copy-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktreeRoot = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'seed.txt'), 'seed\n', 'utf8');
  await writeAt(repo, ORDERS, ORDERS_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGES, FOLDER));
  const config = defineConfig({
    vcs: { enabled: true, author: 'Osq <osq@example.invalid>', worktreeRoot },
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
  const result = await approveSpec(repo, '001', config);
  assert.ok(result.worktreePath, 'approval created a worktree');
  return { repo, worktree: result.worktreePath, config };
}

/** Archive the approved change in its worktree with the acting adapter. */
async function archiveChange(project: Project): Promise<void> {
  await runWatcherOnce(project.repo, project.config, new ActingAdapter());
}

/**
 * Delete whatever approval left and write our own checkout copy of the
 * change, so the test never relies on approval leaving a folder behind.
 */
async function writeCheckoutCopy(repo: string): Promise<string> {
  const draft = path.join(repo, CHANGES, FOLDER);
  await fs.rm(draft, { recursive: true, force: true });
  await fs.mkdir(path.join(draft, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(draft, 'proposal.md'), PROPOSAL, 'utf8');
  await fs.writeFile(path.join(draft, 'tasks', '1.md'), '# edited task\n', 'utf8');
  return draft;
}

async function runStatus(repo: string, config: OsqConfig): Promise<string> {
  let captured = '';
  await statusCommand({
    cwd: repo,
    config,
    stdout: (msg) => {
      captured = msg;
    },
  });
  return captured;
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

async function captureLand(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  try {
    await landCommand(id, {
      cwd,
      config,
      stdout: (msg) => {
        stdout += msg;
      },
      stderr: (msg) => {
        stderr += msg;
      },
    });
    exitCode = 0;
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    stderr += error.message.length > 0 ? `${error.message}\n` : '';
    exitCode = error.exitCode;
  }
  return { stdout, stderr, exitCode };
}

async function captureMessage(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  try {
    await messageCommand(id, {
      cwd,
      config,
      stdout: (msg) => {
        stdout += msg;
      },
      stderr: (msg) => {
        stderr += msg;
      },
    });
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    stderr += error.message.length > 0 ? `${error.message}\n` : '';
    exitCode = error.exitCode;
  }
  return { stdout, stderr, exitCode };
}

function trailerValue(message: string, key: string): string | null {
  for (const line of message.split('\n')) {
    if (line.startsWith(`${key}: `)) return line.slice(key.length + 2).trim();
  }
  return null;
}

describe('osq status ignores a checkout copy of a running change', () => {
  it('Edited checkout copy', async () => {
    const project = await setupProject();
    await writeCheckoutCopy(project.repo);

    const output = await runStatus(project.repo, project.config);

    assert.ok(!output.includes('warning:'));
    assert.equal(output.split(`${FOLDER}: Order Flow`).length - 1, 1);
    assert.ok(output.includes('  worktree: '));
  });

  it('Untouched checkout copy', async () => {
    const project = await setupProject();
    await fs.rm(path.join(project.repo, CHANGES, FOLDER), { recursive: true, force: true });

    const output = await runStatus(project.repo, project.config);

    assert.ok(!output.includes('warning:'));
    assert.equal(output.split(`${FOLDER}: Order Flow`).length - 1, 1);
  });
});

describe('osq land ignores a checkout copy', () => {
  it('Edited leftover copy is kept', async () => {
    const project = await setupProject();
    await archiveChange(project);
    const draft = await writeCheckoutCopy(project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.ok(!capture.stdout.includes('Removed leftover'));
    assert.equal(await exists(draft), true);
  });

  it('Landed by hand, worktree kept', async () => {
    const project = await setupProject();
    await archiveChange(project);
    const prior = await captureMessage(project.repo, project.config, '001');
    await git(['merge', '--squash', BRANCH], project.repo);
    await gitWithInput(['commit', '-F', '-'], project.repo, prior.stdout);
    const head = await git(['rev-parse', 'HEAD'], project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, '');
    const lines = capture.stdout.split('\n');
    assert.equal(lines[0], `${FOLDER} has already landed`);
    assert.match(lines[1] ?? '', /^Removed worktree .*001-order-flow$/);
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), head);
    assert.equal(await exists(project.worktree), false);
  });

  it('Land after archive', async () => {
    const project = await setupProject();
    await archiveChange(project);
    await fs.rm(path.join(project.repo, CHANGES, FOLDER), { recursive: true, force: true });
    const tip = await git(['rev-parse', BRANCH], project.repo);
    const base = await git(['rev-parse', 'HEAD'], project.repo);
    const prior = await captureMessage(project.repo, project.config, '001');

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.equal(await git(['log', '-1', '--format=%P'], project.repo), base);
    assert.equal(
      await git(['rev-parse', 'HEAD^{tree}'], project.repo),
      await git(['rev-parse', `${tip}^{tree}`], project.repo),
    );
    const message = await git(['log', '-1', '--format=%B'], project.repo);
    assert.equal(message.trim(), prior.stdout.trim());
    assert.equal(trailerValue(message, 'Osq-Head'), tip);
    assert.equal(
      await git(['log', '-1', '--format=%an <%ae>'], project.repo),
      project.config.vcs?.author,
    );
    assert.equal(await exists(project.worktree), false);
    assert.equal(await exists(path.join(project.repo, ARCHIVE, FOLDER)), true);
    assert.equal(await exists(path.join(project.repo, CHANGES, FOLDER)), false);
    assert.equal(await git(['branch', '--list', BRANCH], project.repo), BRANCH);
  });
});
