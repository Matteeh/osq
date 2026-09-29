import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createProgram } from '../src/cli/index.js';
import { syncCommand } from '../src/cli/sync.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { syncChange } from '../src/core/vcs/sync-change.js';
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

/** Commit one file on the checkout's current (default) branch. */
async function landOnMain(root: string, relative: string, content: string): Promise<string> {
  await writeAt(root, relative, content);
  await git(['add', '--', relative], root);
  await git(['commit', '-qm', `main ${relative}`], root);
  return git(['rev-parse', 'HEAD'], root);
}

/** Commit one file on the worktree's checked-out branch. */
async function commitOnBranch(worktree: string, relative: string, content: string): Promise<void> {
  await writeAt(worktree, relative, content);
  await git(['add', '--', relative], worktree);
  await git(['commit', '-qm', `branch ${relative}`], worktree);
}

function statusLines(cwd: string): Promise<string[]> {
  return git(['status', '--porcelain=v1', '--untracked-files=all'], cwd).then((output) =>
    output.split('\n').filter((line) => line.trim().length > 0),
  );
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
  readonly dependsOn?: readonly string[];
}

const ONE: ChangeDef = {
  folder: '001-order-flow',
  title: 'Order Flow',
  goal: 'Run the tasks.',
  tasks: [{ title: 'Only task', scope: 'src/one.txt' }],
  delta: ADD_001,
};

const PAIR: ChangeDef = {
  folder: '001-order-flow',
  title: 'Order Flow',
  goal: 'Run the tasks.',
  tasks: [
    { title: 'First task', scope: 'src/one.txt' },
    { title: 'Second task', scope: 'src/two.txt' },
  ],
  delta: ADD_001,
};

const TWO: ChangeDef = {
  folder: '002-second',
  title: 'Second',
  goal: 'Add the second thing.',
  tasks: [{ title: 'Only task', scope: 'src/two.txt' }],
  delta: ADD_002,
  dependsOn: ['001'],
};

function proposalMarkdown(change: ChangeDef): string {
  const depends = change.dependsOn ?? [];
  return [
    '---',
    `title: ${change.title}`,
    `depends_on: [${depends.map((id) => `"${id}"`).join(', ')}]`,
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

/** A committed temp repository with a living `orders` spec and verify.cjs. */
async function baseRepo(): Promise<{ repo: string; parent: string }> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-sync-'));
  tmpDirs.push(parent);
  const repo = path.join(parent, 'repo');
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
  return { repo, parent };
}

function configFor(parent: string): OsqConfig {
  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: path.join(parent, 'worktrees'),
  };
  return defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off' },
  });
}

/** Scaffold a temp repo, approve each change into its own worktree. */
async function setupProject(changes: readonly ChangeDef[]): Promise<Project> {
  const { repo, parent } = await baseRepo();
  const config = configFor(parent);
  const worktrees: Record<string, string> = {};
  for (const change of changes) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
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

function worktreeOf(project: Project, folder: string): string {
  const worktree = project.worktrees[folder];
  assert.ok(worktree, `the project holds a worktree for ${folder}`);
  return worktree;
}

/** Mark a task done by hand, as the watcher's verify gate would. */
async function markDone(worktree: string, folder: string, task: string): Promise<void> {
  await writeAt(worktree, path.posix.join(CHANGES, folder, '.run', 'done', task), 'done\n');
}

/** Parse a change stream into its event objects. */
function parseEvents(content: string): Array<{ type: string; data: Record<string, unknown> }> {
  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { type: string; data: Record<string, unknown> });
}

async function eventsOf(worktree: string, folder: string): Promise<string> {
  return fs.readFile(
    path.join(worktree, CHANGES, folder, '.run', 'events', 'change.jsonl'),
    'utf8',
  );
}

describe('syncChange on request', () => {
  it('syncs an active change and reports the merge', async () => {
    const project = await setupProject([PAIR]);
    const worktree = worktreeOf(project, PAIR.folder);
    await markDone(worktree, PAIR.folder, '1');
    await landOnMain(project.repo, 'src/main.txt', 'main\n');

    const line = await syncChange(project.repo, project.config, '001');

    assert.equal(line, 'Synced osq/001-order-flow with main');
    assert.equal(
      await git(['log', '-1', '--format=%s', worktreeBranch(PAIR.folder)], project.repo),
      'osq: 001 sync main',
    );
  });

  it('reports an already current branch without merging', async () => {
    const project = await setupProject([PAIR]);
    const worktree = worktreeOf(project, PAIR.folder);
    const before = await git(['rev-parse', 'HEAD'], worktree);

    const line = await syncChange(project.repo, project.config, '001');

    assert.equal(line, 'osq/001-order-flow already has main');
    assert.equal(await git(['rev-parse', 'HEAD'], worktree), before);
  });

  it('refuses while a task of the change runs', async () => {
    const project = await setupProject([PAIR]);
    const worktree = worktreeOf(project, PAIR.folder);
    const before = await git(['rev-parse', 'HEAD'], worktree);
    await writeAt(
      worktree,
      path.posix.join(CHANGES, PAIR.folder, '.run', 'running', '1.pid'),
      JSON.stringify({ pid: process.pid, startedAt: Date.now() }),
    );

    await assert.rejects(
      () => syncChange(project.repo, project.config, '001'),
      /001-order-flow has a task running; run osq sync 001 after it ends/,
    );
    assert.equal(await git(['rev-parse', 'HEAD'], worktree), before);
  });

  it('refuses when no change matches the id', async () => {
    const project = await setupProject([PAIR]);
    await assert.rejects(
      () => syncChange(project.repo, project.config, '999'),
      /No change "999" runs in an osq worktree/,
    );
  });

  it('refuses while the worktree has uncommitted changes', async () => {
    const project = await setupProject([PAIR]);
    const worktree = worktreeOf(project, PAIR.folder);
    await writeAt(worktree, 'src/dirty.txt', 'dirty\n');

    await assert.rejects(
      () => syncChange(project.repo, project.config, '001'),
      /has uncommitted changes: src\/dirty\.txt; commit or discard them first/,
    );
  });

  it('refuses when version control is off', async () => {
    const project = await setupProject([PAIR]);
    const off = defineConfig({ vcs: { enabled: false } });
    await assert.rejects(
      () => syncChange(project.repo, off, '001'),
      /osq sync needs vcs\.enabled and git/,
    );
  });

  it('records a stop for an active change without halting it', async () => {
    const project = await setupProject([PAIR]);
    const worktree = worktreeOf(project, PAIR.folder);
    await commitOnBranch(worktree, 'src/one.txt', 'branch\n');
    const before = await git(['rev-parse', 'HEAD'], worktree);
    await landOnMain(project.repo, 'src/one.txt', 'main\n');

    await assert.rejects(
      () => syncChange(project.repo, project.config, '001'),
      /src\/one\.txt conflict with main/,
    );

    assert.equal(await git(['rev-parse', 'HEAD'], worktree), before);
    assert.equal(
      await exists(path.join(worktree, CHANGES, PAIR.folder, '.run', 'regressed', 'change.md')),
      false,
    );
    const events = parseEvents(await eventsOf(worktree, PAIR.folder));
    const last = events.at(-1);
    assert.equal(last?.type, 'sync_stopped');
    assert.equal(last?.data.reason, 'sync_conflict');
    assert.match(String(last?.data.message), /src\/one\.txt conflict with main/);
    assert.equal(last?.data.defaultBranch, 'main');
    const eventsRel = `${CHANGES}/${PAIR.folder}/.run/events/change.jsonl`;
    assert.ok(
      (await statusLines(worktree)).some((line) => line.endsWith(eventsRel)),
      'the sync_stopped event stays uncommitted',
    );
  });

  it('leaves an archived change worktree clean after a stop', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const worktree = worktreeOf(project, ONE.folder);
    await landOnMain(project.repo, 'src/one.txt', 'main\n');

    await assert.rejects(
      () => syncChange(project.repo, project.config, '001'),
      /src\/one\.txt conflict with main/,
    );

    assert.deepEqual(await statusLines(worktree), []);
  });

  it('refuses a dependent stacked on an unlanded change', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    await writeChange(path.join(project.repo, CHANGES, TWO.folder), TWO);
    const approved = await approveSpec(project.repo, '002', project.config);
    assert.ok(approved.stackedPath, 'the dependent gets a stacked approval');

    await assert.rejects(
      () => syncChange(project.repo, project.config, '002'),
      /002-second is stacked on 001-order-flow, which has not landed; land it first/,
    );
  });
});

describe('osq sync command', () => {
  it('prints the result to stdout and the progress to stderr', async () => {
    const project = await setupProject([PAIR]);
    const worktree = worktreeOf(project, PAIR.folder);
    await markDone(worktree, PAIR.folder, '1');
    await landOnMain(project.repo, 'src/main.txt', 'main\n');

    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    await syncCommand('001', {
      cwd: project.repo,
      config: project.config,
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

    assert.equal(exitCode, 0);
    assert.equal(stdout, 'Synced osq/001-order-flow with main\n');
    assert.match(stderr, /main has 1 new commit; merging into osq\/001-order-flow/);
  });

  it('prints a refusal on stderr and sets exit one', async () => {
    const project = await setupProject([PAIR]);
    const off = defineConfig({ vcs: { enabled: false } });
    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    await syncCommand('001', {
      cwd: project.repo,
      config: off,
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

    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, 'osq sync needs vcs.enabled and git\n');
  });

  it('registers sync on the root program', () => {
    const program = createProgram();
    const sync = program.commands.find((command) => command.name() === 'sync');

    assert.ok(sync);
    assert.equal(sync.description(), "merge the default branch into a change's branch");
    assert.equal(sync.registeredArguments[0].name(), 'id');
  });
});
