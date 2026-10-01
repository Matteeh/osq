import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { landCommand } from '../src/cli/land.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { deriveSpecState } from '../src/core/status/state.js';
import { worktreeBranch } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.posix.join('openspec', 'changes');
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

async function writeAt(root: string, relative: string, content: string): Promise<void> {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
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

interface TaskSpec {
  readonly title: string;
  readonly scope: string;
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly goal: string;
  readonly tasks: readonly TaskSpec[];
  readonly delta?: string;
}

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

const ONE: ChangeDef = {
  folder: '001-order-flow',
  title: 'Order Flow',
  goal: 'Run the tasks.',
  tasks: [{ title: 'Only task', scope: 'src/one.txt' }],
  delta: ADD_001,
};

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
    'depends_on: []',
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    change.goal,
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(spec: TaskSpec): string {
  return [
    '---',
    `title: ${spec.title}`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([spec.scope])}`,
    'entry: []',
    'skills: []',
    '---',
    '## Acceptance',
    '- [ ] does the thing',
    '',
  ].join('\n');
}

async function writeChange(folderPath: string, change: ChangeDef): Promise<void> {
  await fs.mkdir(path.join(folderPath, 'tasks'), { recursive: true });
  await fs.writeFile(path.join(folderPath, 'proposal.md'), proposalMarkdown(change), 'utf8');
  const lines = ['# Tasks', ''];
  change.tasks.forEach((task, index) => lines.push(`- [ ] ${index + 1}. ${task.title}`));
  lines.push('');
  await fs.writeFile(path.join(folderPath, 'tasks.md'), lines.join('\n'), 'utf8');
  for (const [index, task] of change.tasks.entries()) {
    await fs.writeFile(
      path.join(folderPath, 'tasks', `${index + 1}.md`),
      taskMarkdown(task),
      'utf8',
    );
  }
  if (change.delta !== undefined) {
    await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), change.delta);
  }
}

/** Fake adapter whose spawn edits the task's scoped file under its project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const target = options.scope[0] ?? 'src/one.txt';
    await fs.writeFile(
      path.join(options.projectRoot, target),
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
  readonly worktrees: Readonly<Record<string, string>>;
  readonly config: OsqConfig;
}

interface SetupOptions {
  readonly prepare?: string;
}

/** A committed temp repository with each change approved into its own worktree. */
async function setupProject(
  changes: readonly ChangeDef[],
  options: SetupOptions = {},
): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-land-steer-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktreeRoot = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.writeFile(
    path.join(repo, 'prepare.cjs'),
    "process.exit(require('fs').existsSync('prepare-fail') ? 1 : 0);\n",
    'utf8',
  );
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, 'src', 'seed.txt'), 'seed\n', 'utf8');
  await writeAt(repo, ORDERS, ORDERS_SPEC);
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  for (const change of changes) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
    ...(options.prepare !== undefined ? { prepare: options.prepare } : {}),
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });

  const worktrees: Record<string, string> = {};
  for (const change of changes) {
    const id = change.folder.split('-')[0] as string;
    const result = await approveSpec(repo, id, config);
    assert.ok(result.worktreePath, `approval created a worktree for ${id}`);
    worktrees[change.folder] = result.worktreePath;
  }
  return { repo, worktrees, config };
}

async function archiveAll(project: Project): Promise<void> {
  await runWatcherOnce(project.repo, project.config, new ActingAdapter());
}

function archivedFolder(worktree: string, folder: string): string {
  return path.join(worktree, 'openspec', 'changes', 'archive', folder);
}

function statusLines(cwd: string): Promise<string[]> {
  return git(['status', '--porcelain=v1', '--untracked-files=all'], cwd).then((output) =>
    output.split('\n').filter((line) => line.trim().length > 0),
  );
}

describe('osq land records a steering stop', () => {
  it('records a conflict on the branch and leaves the checkout alone', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const worktree = project.worktrees[ONE.folder] as string;
    await writeAt(project.repo, 'src/one.txt', 'main\n');
    await git(['add', '--', 'src/one.txt'], project.repo);
    await git(['commit', '-qm', 'main moves'], project.repo);

    const beforeHead = await git(['rev-parse', 'HEAD'], project.repo);
    const beforeStatus = await statusLines(project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.match(
      capture.stderr,
      /src\/one\.txt conflict with main; run osq plan 001, and approving the revised plan restarts osq\/001-order-flow from main/,
    );
    assert.equal(
      await git(['log', '-1', '--format=%s', worktreeBranch(ONE.folder)], project.repo),
      'osq: 001 land stopped',
    );
    const marker = await fs.readFile(
      path.join(archivedFolder(worktree, ONE.folder), '.run', 'regressed', 'change.md'),
      'utf8',
    );
    assert.match(marker, /^---\nreason: sync_conflict\n---\n/);
    assert.ok(marker.includes('src/one.txt'));
    assert.deepEqual(await statusLines(worktree), []);
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), beforeHead);
    assert.deepEqual(await statusLines(project.repo), beforeStatus);
  });

  it('records a red verify after the merge', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const worktree = project.worktrees[ONE.folder] as string;
    await writeAt(project.repo, 'verify.cjs', 'process.exit(1);\n');
    await git(['add', '--', 'verify.cjs'], project.repo);
    await git(['commit', '-qm', 'verify goes red'], project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.match(capture.stderr, /verify failed on osq\/001-order-flow merged with main:/);
    assert.equal(
      await git(['log', '-1', '--format=%s', worktreeBranch(ONE.folder)], project.repo),
      'osq: 001 land stopped',
    );
    const folderPath = archivedFolder(worktree, ONE.folder);
    const marker = await fs.readFile(
      path.join(folderPath, '.run', 'regressed', 'change.md'),
      'utf8',
    );
    assert.match(marker, /^---\nreason: sync_verify_red\n---\n/);
    const state = await deriveSpecState(worktree, folderPath);
    assert.equal(state.steering?.[0]?.target, 'change');
    assert.equal(state.steering?.[0]?.trigger, 'regression');
    assert.equal(state.steering?.[0]?.reason, 'sync_verify_red');
    assert.deepEqual(await statusLines(worktree), []);
  });

  it('records nothing for a stop that is not a steering trigger', async () => {
    const project = await setupProject([ONE], { prepare: 'node prepare.cjs' });
    await archiveAll(project);
    const worktree = project.worktrees[ONE.folder] as string;
    const branch = worktreeBranch(ONE.folder);
    await writeAt(project.repo, 'prepare-fail', 'now fail\n');
    await git(['add', '--', 'prepare-fail'], project.repo);
    await git(['commit', '-qm', 'prepare fails'], project.repo);
    const beforeTip = await git(['rev-parse', branch], project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.match(capture.stderr, /prepare failed/);
    assert.equal(capture.stderr.includes('land stopped'), false);
    assert.equal(await git(['rev-parse', branch], project.repo), beforeTip);
    const regressed = await fs
      .readFile(path.join(archivedFolder(worktree, ONE.folder), '.run', 'regressed', 'change.md'))
      .catch(() => null);
    assert.equal(regressed, null);
  });

  it('refuses the next land until the change is steered', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    await writeAt(project.repo, 'src/one.txt', 'main\n');
    await git(['add', '--', 'src/one.txt'], project.repo);
    await git(['commit', '-qm', 'main moves'], project.repo);

    const first = await captureLand(project.repo, project.config, '001');
    assert.equal(first.exitCode, 1);
    const branch = worktreeBranch(ONE.folder);
    const afterFirst = await git(['rev-parse', branch], project.repo);

    const second = await captureLand(project.repo, project.config, '001');

    assert.equal(second.exitCode, 1);
    assert.equal(second.stdout, '');
    assert.equal(
      second.stderr,
      '001-order-flow needs steering: change conflict (sync_conflict); run osq plan 001\n',
    );
    assert.equal(await git(['rev-parse', branch], project.repo), afterFirst);
  });
});
