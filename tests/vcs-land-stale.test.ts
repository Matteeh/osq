import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createProgram } from '../src/cli/index.js';
import { REBUILD_MESSAGE, landCommand } from '../src/cli/land.js';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { landChange } from '../src/core/vcs/land.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { STALE_BUILD_MESSAGE } from '../src/watcher/build.js';
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

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

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

const STALE_TIME = new Date('2024-01-01T00:00:00Z');
const FRESH_TIME = new Date('2030-01-01T00:00:00Z');

/** A package root with `src/index.ts` and `dist/index.js`, fresh or stale. */
async function writePackage(root: string, stale: boolean): Promise<void> {
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  const srcFile = path.join(root, 'src', 'index.ts');
  const distFile = path.join(root, 'dist', 'index.js');
  await fs.writeFile(srcFile, 'source\n', 'utf8');
  await fs.writeFile(distFile, 'compiled\n', 'utf8');
  if (stale) {
    await fs.utimes(distFile, STALE_TIME, STALE_TIME);
    await fs.utimes(srcFile, FRESH_TIME, FRESH_TIME);
  } else {
    await fs.utimes(distFile, FRESH_TIME, FRESH_TIME);
  }
}

interface Capture {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | null;
}

interface LandOptions {
  readonly allowStale?: boolean;
  readonly packageRoot?: string;
}

async function captureLand(
  cwd: string,
  config: OsqConfig,
  id: string,
  options: LandOptions = {},
): Promise<Capture> {
  let stdout = '';
  let stderr = '';
  let exitCode: number | null = null;
  await landCommand(id, {
    cwd,
    config,
    allowStale: options.allowStale,
    packageRoot: options.packageRoot,
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

/** A committed temp repository with each change approved into its own worktree. */
async function setupProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-stale-'));
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

describe('osq land stale build', () => {
  it('refuses a stale build with the stale line and leaves the default branch alone', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const packageRoot = await makeTempDir('osq-stale-package-');
    await writePackage(packageRoot, true);
    const before = await git(['rev-parse', 'HEAD'], project.repo);

    const capture = await captureLand(project.repo, project.config, '001', { packageRoot });

    assert.equal(capture.exitCode, 1);
    assert.equal(capture.stdout, '');
    assert.equal(capture.stderr, `${STALE_BUILD_MESSAGE}\n`);
    assert.equal(await git(['rev-parse', 'HEAD'], project.repo), before);
  });

  it('lands with allowStale even when the build is stale', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const packageRoot = await makeTempDir('osq-stale-package-');
    await writePackage(packageRoot, true);

    const capture = await captureLand(project.repo, project.config, '001', {
      allowStale: true,
      packageRoot,
    });

    assert.equal(capture.exitCode, 0);
    assert.equal(capture.stderr, '');
    assert.match(capture.stdout, /^Landed 001-order-flow as [0-9a-f]{40}$/m);
  });

  it('says to rebuild when the land changes osq itself', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    await writePackage(project.repo, false);

    const capture = await captureLand(project.repo, project.config, '001', {
      packageRoot: project.repo,
    });

    assert.equal(capture.exitCode, 0);
    const lines = capture.stdout.trimEnd().split('\n');
    assert.equal(lines.at(-1), REBUILD_MESSAGE);
  });

  it('resolves a linked package root through real paths', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    await writePackage(project.repo, false);
    const link = path.join(await makeTempDir('osq-stale-link-'), 'linked');
    await fs.symlink(project.repo, link, 'dir');

    const capture = await captureLand(project.repo, project.config, '001', { packageRoot: link });

    assert.equal(capture.exitCode, 0);
    const lines = capture.stdout.trimEnd().split('\n');
    assert.equal(lines.at(-1), REBUILD_MESSAGE);
  });

  it('says nothing when the package root is a separate consumer project', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    const packageRoot = await makeTempDir('osq-stale-package-');
    await writePackage(packageRoot, false);

    const capture = await captureLand(project.repo, project.config, '001', { packageRoot });

    assert.equal(capture.exitCode, 0);
    assert.ok(!capture.stdout.includes(REBUILD_MESSAGE));
    assert.match(capture.stdout, /^Landed 001-order-flow as [0-9a-f]{40}$/m);
  });

  it('registers the allow-stale flag on the land command', () => {
    const program = createProgram();
    const land = program.commands.find((command) => command.name() === 'land');
    assert.ok(land);
    assert.match(land.helpInformation(), /--allow-stale/);
  });
});

describe('landChange changed paths', () => {
  it('reports the absolute path of a file the land commit adds', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);

    const result = await landChange(project.repo, project.config, '001');

    assert.equal(result.code, 0);
    assert.ok(result.changed.includes(path.join(project.repo, 'src', 'one.txt')));
  });

  it('reports no changed paths when there is nothing left to land', async () => {
    const project = await setupProject([ONE]);
    await archiveAll(project);
    await landChange(project.repo, project.config, '001');

    const again = await landChange(project.repo, project.config, '001');

    assert.equal(again.code, 0);
    assert.deepEqual(again.changed, []);
  });
});
