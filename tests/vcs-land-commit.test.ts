import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { landCommand } from '../src/cli/land.js';
import { messageCommand } from '../src/cli/message.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { worktreeBranch } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.posix.join(CHANGES, 'archive');
const ORDERS = path.posix.join('openspec', 'specs', 'orders', 'spec.md');

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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

async function statusLines(cwd: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd, env: cleanGitEnv() },
  );
  return stdout.split('\n').filter((line) => line.trim().length > 0);
}

function trailerLines(output: string, key: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith(`${key}:`));
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
  await landCommand(id, {
    cwd,
    config,
    stdout: (msg) => {
      stdout += msg;
    },
    stderr: (msg) => {
      stderr += msg;
    },
    exit: (code) => {
      exitCode = code;
    },
  });
  return { stdout, stderr, exitCode };
}

async function captureMessage(cwd: string, config: OsqConfig, id: string): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  await messageCommand(id, {
    cwd,
    config,
    stdout: (msg) => {
      stdout += msg;
    },
    stderr: (msg) => {
      stderr += msg;
    },
    exit: (code) => {
      exitCode = code;
    },
  });
  return { stdout, stderr, exitCode };
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

const FOLDER = '001-order-flow';

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
  readonly worktreeRoot: string;
  readonly config: OsqConfig;
}

function makeConfig(worktreeRoot: string, prepare?: string): OsqConfig {
  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
    ...(prepare !== undefined ? { prepare } : {}),
  };
  return defineConfig({ vcs, gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' } });
}

/** A committed temp repository with the one change archived into its worktree. */
async function setupProject(): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-land-commit-'));
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
  await fs.writeFile(path.join(repo, 'src', 'one.txt'), 'seed one\n', 'utf8');
  await fs.writeFile(path.join(repo, 'README.md'), 'readme\n', 'utf8');
  await writeAt(repo, ORDERS, ORDERS_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  await writeChange(path.join(repo, CHANGES, FOLDER));
  const config = makeConfig(worktreeRoot);
  const result = await approveSpec(repo, '001', config);
  assert.ok(result.worktreePath, 'approval created a worktree');
  await runWatcherOnce(repo, config, new ActingAdapter());
  return { repo, worktree: result.worktreePath, worktreeRoot, config };
}

/** Commit an unrelated file on the default branch so the sync merges. */
async function moveMain(project: Project): Promise<void> {
  await writeAt(project.repo, 'other.txt', 'moved\n');
  await git(['add', '--', 'other.txt'], project.repo);
  await git(['commit', '-qm', 'main moves'], project.repo);
}

function eventsFor(repo: string, folder: string): Promise<string> {
  return git(
    ['show', `${worktreeBranch(folder)}:${ARCHIVE}/${folder}/.run/events/change.jsonl`],
    repo,
  );
}

describe('Land from the verified tree', () => {
  it('Unrelated uncommitted work stays', async () => {
    const project = await setupProject();
    await writeAt(project.repo, 'README.md', 'edited\n');
    await writeAt(project.repo, 'notes.txt', 'notes\n');
    await git(['add', '--', 'notes.txt'], project.repo);
    await writeAt(project.repo, path.posix.join(CHANGES, '099-draft', 'proposal.md'), '# draft\n');

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    const status = await statusLines(project.repo);
    assert.ok(status.includes(' M README.md'));
    assert.ok(status.includes('A  notes.txt'));
    assert.ok(status.some((line) => line.includes('099-draft')));
    assert.equal(await fs.readFile(path.join(project.repo, 'README.md'), 'utf8'), 'edited\n');
  });

  it('Uncommitted file the change writes', async () => {
    const project = await setupProject();
    await writeAt(project.repo, 'src/one.txt', 'edited\n');
    const before = await git(['rev-parse', 'HEAD'], project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(
      capture.stderr,
      'The checkout has uncommitted changes in files this land writes: src/one.txt; commit or stash them, then run osq land 001 again\n',
    );
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), before);
    assert.equal(await fs.readFile(path.join(project.repo, 'src', 'one.txt'), 'utf8'), 'edited\n');
  });

  it('Default branch moves during the land', async () => {
    const project = await setupProject();
    await moveMain(project);
    const config = makeConfig(
      project.worktreeRoot,
      `git -C ${project.repo} commit --allow-empty -qm moved`,
    );

    const capture = await captureLand(project.repo, config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.match(capture.stderr, /main moved while landing; run osq land 001 again/);
    assert.equal(await git(['log', '-1', '--format=%s'], project.repo), 'moved');
  });

  it('No verify without a merge', async () => {
    const project = await setupProject();
    await fs.writeFile(path.join(project.worktree, 'verify.cjs'), 'process.exit(1);\n', 'utf8');
    await git(['add', '--', 'verify.cjs'], project.worktree);
    await git(['commit', '-qm', 'verify fails'], project.worktree);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, '');
  });
});

describe('Default branch sync', () => {
  it('Sync announces itself', async () => {
    const project = await setupProject();
    await moveMain(project);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.equal(
      capture.stderr,
      'main has 1 new commit; merging into osq/001-order-flow and running verify: node verify.cjs\n',
    );
  });

  it('Sync records its verify', async () => {
    const project = await setupProject();
    await moveMain(project);
    await captureLand(project.repo, project.config, '001');

    const lines = (await eventsFor(project.repo, FOLDER))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
    const verify = lines[lines.length - 2];
    const synced = lines[lines.length - 1];

    assert.equal(verify?.type, 'verify_ran');
    assert.equal(verify?.data.command, 'node verify.cjs');
    assert.equal(verify?.data.exitCode, 0);
    assert.equal(typeof verify?.data.duration, 'number');
    assert.equal(synced?.type, 'synced');
    assert.equal(synced?.data.defaultBranch, 'main');
    assert.equal(synced?.data.commits, 1);
    assert.equal(typeof synced?.data.duration, 'number');
  });
});

describe('Land command', () => {
  it('Progress on stderr', async () => {
    const project = await setupProject();
    await moveMain(project);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.ok(capture.stderr.startsWith('main has 1 new commit; merging into osq/001-order-flow'));
    assert.equal(capture.stdout.split('\n').filter((line) => line.length > 0).length, 3);
    assert.ok(!capture.stdout.includes('merging into'));
  });
});

describe('Land message command', () => {
  it("Message is the land commit's message", async () => {
    const project = await setupProject();
    const prior = await captureMessage(project.repo, project.config, '001');
    assert.equal(prior.exitCode, null);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    const message = await git(['log', '-1', '--format=%B'], project.repo);
    assert.equal(message.trim(), prior.stdout.trim());
    const trailers = await gitWithInput(['interpret-trailers', '--parse'], project.repo, message);
    assert.equal(trailerLines(trailers, 'Osq-Change').length, 1);
    assert.equal(trailerLines(trailers, 'Osq-Head').length, 1);
  });
});
