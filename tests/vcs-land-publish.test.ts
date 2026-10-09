import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { CommandError } from '../src/cli/command-error.js';
import { landCommand } from '../src/cli/land.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { landAndPublish } from '../src/core/vcs/land-publish.js';
import type { LandResult } from '../src/core/vcs/land.js';
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

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

async function captureLand(
  cwd: string,
  config: OsqConfig,
  id: string,
  publish = false,
): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  try {
    await landCommand(id, {
      cwd,
      config,
      publish,
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

interface TaskSpec {
  readonly title: string;
  readonly scope: string;
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly goal: string;
  readonly tasks: readonly TaskSpec[];
  readonly delta: string;
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
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), change.delta);
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-publish-'));
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

interface Origin {
  readonly bare: string;
  readonly mover: string;
}

/** Add a bare `origin`, push `main` to it, and clone a second mover from it. */
async function addOrigin(project: Project): Promise<Origin> {
  const parent = path.dirname(project.repo);
  const bare = path.join(parent, 'origin.git');
  await git(['init', '-q', '--bare', '-b', 'main', bare], parent);
  await git(['remote', 'add', 'origin', bare], project.repo);
  await git(['push', '-q', 'origin', 'main'], project.repo);
  const mover = path.join(parent, 'mover');
  await git(['clone', '-q', bare, mover], parent);
  await git(['config', 'user.name', 'osq'], mover);
  await git(['config', 'user.email', 'osq@example.invalid'], mover);
  return { bare, mover };
}

/** `origin`'s `main` commit, read straight from the bare repository. */
async function originMain(origin: Origin): Promise<string> {
  return git(['--git-dir', origin.bare, 'rev-parse', 'main'], path.dirname(origin.bare));
}

/** Commit one file in the mover clone and push it to `origin`'s `main`. */
async function moveOrigin(origin: Origin, name: string): Promise<string> {
  await fs.writeFile(path.join(origin.mover, name), `${name}\n`, 'utf8');
  await git(['add', '--', name], origin.mover);
  await git(['commit', '-qm', name], origin.mover);
  await git(['push', '-q', 'origin', 'main'], origin.mover);
  return git(['rev-parse', 'HEAD'], origin.mover);
}

/** Commit one file on the checkout's own `main`, diverging from origin. */
async function commitLocal(repo: string, name: string): Promise<string> {
  await fs.writeFile(path.join(repo, name), `${name}\n`, 'utf8');
  await git(['add', '--', name], repo);
  await git(['commit', '-qm', name], repo);
  return git(['rev-parse', 'HEAD'], repo);
}

async function publish(
  project: Project,
  id: string,
  hooks?: { afterFetch?: () => Promise<void> },
): Promise<LandResult> {
  return landAndPublish(project.repo, project.config, id, () => {}, hooks);
}

describe('osq land publishes to origin', () => {
  it('pushes the land commit and prints the push before the land line', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const origin = await addOrigin(project);

    const result = await publish(project, '001');

    const head = await git(['rev-parse', 'HEAD'], project.repo);
    assert.equal(await originMain(origin), head);
    assert.equal(result.code, 0);
    assert.match(result.lines[0] ?? '', /^Pushed [0-9a-f]{40} to origin\/main$/);
    assert.match(result.lines[1] ?? '', /^Landed 001-order-flow as [0-9a-f]{40}$/);
  });

  it('fast-forwards to origin when origin is ahead, then lands and pushes', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const origin = await addOrigin(project);
    const ahead = await moveOrigin(origin, 'ahead.txt');

    const result = await publish(project, '001');

    assert.equal(result.lines[0], 'Updated main to origin/main');
    assert.match(result.lines[1] ?? '', /^Pushed [0-9a-f]{40} to origin\/main$/);
    const head = await git(['rev-parse', 'HEAD'], project.repo);
    assert.equal(await originMain(origin), head);
    assert.equal(await git(['merge-base', '--is-ancestor', ahead, head], project.repo), '');
  });

  it('stops when origin moved during the land, then lands on a second attempt', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const origin = await addOrigin(project);
    const before = await git(['rev-parse', 'HEAD'], project.repo);
    let moved: string | null = null;

    await assert.rejects(
      () =>
        publish(project, '001', {
          afterFetch: async () => {
            moved = await moveOrigin(origin, 'during.txt');
          },
        }),
      /origin\/main moved while landing; run osq land 001 again/,
    );

    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), before);
    assert.equal(await originMain(origin), moved);

    await publish(project, '001');

    const head = await git(['rev-parse', 'HEAD'], project.repo);
    assert.equal(await originMain(origin), head);
  });

  it('stops on divergence and moves neither branch', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const origin = await addOrigin(project);
    await moveOrigin(origin, 'theirs.txt');
    const mine = await commitLocal(project.repo, 'mine.txt');
    const remote = await originMain(origin);

    await assert.rejects(
      () => publish(project, '001'),
      /main and origin\/main have diverged; nothing was landed\. Merge origin\/main into main on the server, then run osq land 001 again/,
    );

    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), mine);
    assert.equal(await originMain(origin), remote);
  });

  it('stops at the fetch when origin is missing and lands nothing', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const before = await git(['rev-parse', 'HEAD'], project.repo);

    await assert.rejects(
      () => publish(project, '001'),
      /Could not fetch origin\/main; nothing was landed/,
    );

    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), before);
    assert.equal(await exists(project.worktrees[ONE.folder] as string), true);
  });

  it('pushes the default branch when the change had already landed', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const origin = await addOrigin(project);

    const first = await captureLand(project.repo, project.config, '001');
    assert.equal(first.exitCode, 0);
    const landed = await git(['rev-parse', 'HEAD'], project.repo);
    assert.notEqual(await originMain(origin), landed);

    const result = await publish(project, '001');

    assert.equal(result.lines[0], `Pushed ${landed} to origin/main`);
    assert.equal(await originMain(origin), landed);
  });

  it('lands through landCommand with publish and leaves origin untouched without it', async () => {
    const published = await setupProject([ONE]);
    await archiveAll(published);
    const publishedOrigin = await addOrigin(published);

    const capture = await captureLand(published.repo, published.config, '001', true);

    assert.equal(capture.exitCode, 0);
    assert.match(capture.stdout, /^Pushed [0-9a-f]{40} to origin\/main$/m);
    assert.equal(
      await originMain(publishedOrigin),
      await git(['rev-parse', 'HEAD'], published.repo),
    );

    const local = await setupProject([ONE]);
    await archiveAll(local);
    const localOrigin = await addOrigin(local);
    const behind = await originMain(localOrigin);

    const plain = await captureLand(local.repo, local.config, '001');

    assert.equal(plain.exitCode, 0);
    assert.equal(await originMain(localOrigin), behind);
  });
});
