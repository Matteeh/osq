import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createProgram } from '../src/cli/index.js';
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

/** Write an executable hook into a repository's shared hooks directory. */
async function writeHook(root: string, name: string, body: string): Promise<void> {
  const dir = path.resolve(root, await git(['rev-parse', '--git-path', 'hooks'], root));
  const file = path.join(dir, name);
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await fs.chmod(file, 0o755);
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

const ADD_002 = `# Spec Delta: orders

## Purpose

Adds order 002.

## ADDED Requirements

### Requirement: Order 002
The system SHALL add order 002.

#### Scenario: 002 runs
- **WHEN** 002 runs
- **THEN** order 002 is added
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

const TWO: ChangeDef = {
  folder: '002-second',
  title: 'Second',
  goal: 'Add the second thing.',
  tasks: [{ title: 'Only task', scope: 'src/two.txt' }],
  delta: ADD_002,
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

/** A committed temp repository with each change approved into its own worktree. */
async function setupProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-land-'));
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

  for (const change of changes) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot,
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

function checkoutFolder(repo: string, folder: string): string {
  return path.join(repo, CHANGES, folder);
}

function trailerValue(message: string, key: string): string | null {
  for (const line of message.split('\n')) {
    if (line.startsWith(`${key}: `)) return line.slice(key.length + 2).trim();
  }
  return null;
}

function statusLines(cwd: string): Promise<string[]> {
  return git(['status', '--porcelain=v1', '--untracked-files=all'], cwd).then((output) =>
    output.split('\n').filter((line) => line.trim().length > 0),
  );
}

describe('osq land', () => {
  it('lands an archived change, prints its lines, and cleans up the draft and worktree', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const worktree = project.worktrees[ONE.folder] as string;
    const branch = worktreeBranch(ONE.folder);
    const tip = await git(['rev-parse', branch], project.repo);
    const prior = await captureMessage(project.repo, project.config, '001');
    assert.equal(prior.exitCode, null);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, '');
    const lines = capture.stdout.split('\n');
    assert.match(lines[0] ?? '', /^Landed 001-order-flow as [0-9a-f]{40}$/);
    assert.equal(lines[1], `Removed leftover draft ${CHANGES}/001-order-flow`);
    assert.match(lines[2] ?? '', /^Removed worktree .*001-order-flow$/);
    assert.equal(lines[3], `Kept branch ${branch}`);

    const head = await git(['rev-parse', 'HEAD'], project.repo);
    assert.notEqual(head, tip);
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
    assert.equal(await exists(checkoutFolder(project.repo, ONE.folder)), false);
    assert.equal(await exists(worktree), false);
    assert.equal(await git(['branch', '--list', branch], project.repo), branch);
  });

  it('lands two changes in order, rebuilding the shared living spec', async () => {
    const project = await setupProject([ONE, TWO]);
    await archiveAll(project);

    const first = await captureLand(project.repo, project.config, '001');
    assert.equal(first.exitCode, 0);
    const afterFirst = await fs.readFile(path.join(project.repo, ORDERS), 'utf8');
    assert.ok(afterFirst.includes('Order 001'));
    assert.ok(!afterFirst.includes('Order 002'));

    const second = await captureLand(project.repo, project.config, '002');
    assert.equal(second.exitCode, 0);
    assert.equal(
      await git(['log', '-1', '--format=%s', worktreeBranch(TWO.folder)], project.repo),
      'osq: 002 sync main',
    );
    const syncCommit = await git(['rev-parse', worktreeBranch(TWO.folder)], project.repo);
    const message = await git(['log', '-1', '--format=%B'], project.repo);
    assert.equal(trailerValue(message, 'Osq-Head'), syncCommit);

    const living = await fs.readFile(path.join(project.repo, ORDERS), 'utf8');
    assert.ok(living.includes('Order 001'));
    assert.ok(living.includes('Order 002'));
    assert.ok(!living.includes('<<<<<<<'));
  });

  it('stops on a sync conflict and leaves the checkout alone', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
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
      /src\/one\.txt conflict with main; merge it into osq\/001-order-flow by hand in .*then run osq land 001 again/,
    );
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), beforeHead);
    assert.deepEqual(await statusLines(project.repo), beforeStatus);
  });

  it('leaves the squash staged when a hook rejects the land commit', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    await writeHook(project.repo, 'pre-commit', 'echo "blocked by hook"\nexit 1');

    const beforeHead = await git(['rev-parse', 'HEAD'], project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.match(capture.stdout, /blocked by hook/);
    assert.match(
      capture.stdout,
      /The squash is staged\. Finish with: osq message 001 \| git commit -F -/,
    );
    assert.match(capture.stdout, /Or undo it with: git reset --merge/);
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), beforeHead);
    assert.ok((await statusLines(project.repo)).some((line) => line.includes('openspec/')));
  });
});

describe('osq land cleanup', () => {
  it('cleans up a change landed by hand with the worktree kept', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const worktree = project.worktrees[ONE.folder] as string;
    await git(['merge', '--squash', worktreeBranch(ONE.folder)], project.repo);
    await git(['commit', '-qm', 'hand land'], project.repo);
    const head = await git(['rev-parse', 'HEAD'], project.repo);

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, '');
    const lines = capture.stdout.split('\n');
    assert.equal(lines[0], '001-order-flow has already landed');
    assert.equal(lines[1], `Removed leftover draft ${CHANGES}/001-order-flow`);
    assert.match(lines[2] ?? '', /^Removed worktree .*001-order-flow$/);
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), head);
    assert.equal(await exists(checkoutFolder(project.repo, ONE.folder)), false);
    assert.equal(await exists(worktree), false);
  });

  it('reports nothing to clean up the second time', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    assert.equal((await captureLand(project.repo, project.config, '001')).exitCode, 0);

    const again = await captureLand(project.repo, project.config, '001');

    assert.equal(again.exitCode, 0);
    assert.equal(again.stderr, '');
    assert.equal(again.stdout, '001-order-flow has already landed; nothing to clean up\n');
  });

  it('keeps an edited leftover copy in place', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const draft = checkoutFolder(project.repo, ONE.folder);
    await fs.appendFile(path.join(draft, 'tasks', '1.md'), '\nedited\n', 'utf8');

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 0);
    assert.ok(!capture.stdout.includes('Removed leftover draft'));
    assert.equal(await exists(draft), true);
  });
});

describe('osq land command', () => {
  it('prints a refusal on stderr and nothing on stdout', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    await writeAt(project.repo, 'src/seed.txt', 'edited\n');

    const capture = await captureLand(project.repo, project.config, '001');

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(
      capture.stderr,
      'The checkout has uncommitted changes: src/seed.txt; commit or stash them first\n',
    );
  });

  it('registers land and doctor on the root program', () => {
    const program = createProgram();
    const names = program.commands.map((command) => command.name());
    assert.ok(names.includes('land'));
    assert.ok(names.includes('doctor'));
  });
});
