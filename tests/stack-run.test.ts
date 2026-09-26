import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_GATES_CONFIG } from '../src/core/foundation/config-gates.js';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import type { Logger } from '../src/core/foundation/logger.js';
import { retrySpec } from '../src/core/lifecycle/retry.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { stackedPath, worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.join('openspec', 'changes');
const CHANGE_ONE = '001-a';
const CHANGE_TWO = '002-b';
const CHANGE_THREE = '003-c';
const IN_SCOPE = 'src/one.txt';
const OUT_SCOPE = 'src/out.txt';

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

async function readTrimmed(target: string): Promise<string> {
  return (await fs.readFile(target, 'utf8')).trim();
}

async function commitSubjects(cwd: string, ref: string): Promise<string[]> {
  const output = await git(['log', '--format=%s', ref], cwd);
  return output.split('\n').filter((line) => line.trim().length > 0);
}

/** The commit whose subject contains `subject`, scoped to `ref`. */
async function findCommit(cwd: string, subject: string, ref = 'HEAD'): Promise<string> {
  return git(['log', '--format=%H', '-1', '--fixed-strings', `--grep=${subject}`, ref], cwd);
}

function parseMarker(content: string): { reason: string; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!match) return { reason: '', body: content.trim() };
  const reason = /(?:^|\n)reason:\s*(.+)/.exec(match[1] ?? '')?.[1]?.trim() ?? '';
  return { reason, body: (match[2] ?? '').trim() };
}

async function readRegressed(folderPath: string): Promise<{ reason: string; body: string }> {
  const content = await fs.readFile(
    path.join(folderPath, '.run', 'regressed', 'change.md'),
    'utf8',
  );
  return parseMarker(content);
}

/** The stacked approval directory of a change folder. */
function stackedRoot(project: Project, folder: string): string {
  return stackedPath(project.vcs, project.repo, folder);
}

/** The stacked copy of `folder`. */
function stackedCopy(project: Project, folder: string): string {
  return path.join(stackedRoot(project, folder), CHANGES, folder);
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
}

const ONE: ChangeDef = { folder: CHANGE_ONE, title: 'One', dependsOn: [] };
const TWO: ChangeDef = { folder: CHANGE_TWO, title: 'Two', dependsOn: ['001'] };
const THREE: ChangeDef = {
  folder: CHANGE_THREE,
  title: 'Three',
  dependsOn: ['001', '002'],
};

function proposalMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title}`,
    `depends_on: [${change.dependsOn.map((id) => JSON.stringify(id)).join(', ')}]`,
    'verify: node verify.cjs',
    'features:',
    '  reads: []',
    '---',
    '## Goal',
    'Run the task.',
    '',
    '## Surface',
    'None.',
    '',
    '## Human steps',
    'None',
    '',
  ].join('\n');
}

function taskMarkdown(change: ChangeDef): string {
  return [
    '---',
    `title: ${change.title} task`,
    'verify: node verify.cjs',
    `scope: ${JSON.stringify([IN_SCOPE])}`,
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
  await fs.writeFile(
    path.join(folderPath, 'tasks.md'),
    `# Tasks\n\n- [ ] 1. ${change.title}\n`,
    'utf8',
  );
  await fs.writeFile(path.join(folderPath, 'tasks', '1.md'), taskMarkdown(change), 'utf8');
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

interface ProjectOptions {
  readonly changes?: readonly ChangeDef[];
  readonly prepare?: string;
}

async function makeProject(options: ProjectOptions = {}): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stack-run-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  await fs.mkdir(repo, { recursive: true });
  await installFakeValidator(repo);
  await scaffoldProject(repo);
  await fs.writeFile(path.join(repo, '.gitignore'), 'node_modules/\n.run/running/\n', 'utf8');
  await fs.writeFile(path.join(repo, 'verify.cjs'), 'process.exit(0);\n', 'utf8');
  await fs.mkdir(path.join(repo, 'src'), { recursive: true });
  await fs.writeFile(path.join(repo, IN_SCOPE), 'seed\n', 'utf8');
  await fs.writeFile(path.join(repo, OUT_SCOPE), 'out\n', 'utf8');
  await git(['init', '-q', '-b', 'main'], repo);
  await git(['config', 'user.name', 'osq'], repo);
  await git(['config', 'user.email', 'osq@example.invalid'], repo);
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'seed'], repo);

  for (const change of options.changes ?? [ONE, TWO]) {
    await writeChange(path.join(repo, CHANGES, change.folder), change);
  }

  const vcs: VcsConfig = {
    enabled: true,
    author: 'Osq <osq@example.invalid>',
    worktreeRoot: worktrees,
    ...(options.prepare !== undefined ? { prepare: options.prepare } : {}),
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
  return { root, repo, worktrees, config, vcs };
}

/** A logger that keeps every info line. */
class CaptureLogger implements Logger {
  readonly infos: string[] = [];
  readonly errors: string[] = [];
  readonly symbols = false;

  info(msg: string): void {
    this.infos.push(msg);
  }
  verbose(): void {}
  warn(): void {}
  error(msg: string): void {
    this.errors.push(msg);
  }
  status(): void {}
  clearStatus(): void {}
}

/** Fake adapter whose spawn edits one scoped file under the spawn's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';
  readonly calls: SpawnTaskOptions[] = [];

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    this.calls.push({ ...options });
    await fs.writeFile(
      path.join(options.projectRoot, IN_SCOPE),
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

/** Approve `folder` and return the worktree path approval created. */
async function approveIntoWorktree(project: Project, folder: string): Promise<string> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
  return result.worktreePath;
}

describe('Stacked cut', () => {
  it('cuts the dependent from the dependency archive commit and runs the chain', async () => {
    const project = await makeProject();
    await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    assert.equal(await exists(stackedRoot(project, CHANGE_TWO)), true);
    const checkout = await git(['status', '--porcelain'], project.repo);

    const adapter = new ActingAdapter();
    await runWatcherOnce(project.repo, project.config, adapter);

    assert.deepEqual(await commitSubjects(project.repo, 'osq/001-a'), [
      'osq: 001 archived',
      'osq: 001 task 1 verified',
      'osq: 001 approved',
      'seed',
    ]);
    const archiveCommit = await git(['rev-parse', worktreeBranch(CHANGE_ONE)], project.repo);
    const approved = await findCommit(
      project.repo,
      'osq: 002 approved',
      worktreeBranch(CHANGE_TWO),
    );
    assert.notEqual(approved, '');
    assert.equal(await git(['rev-parse', `${approved}^`], project.repo), archiveCommit);

    const baseRef = path.posix.join(CHANGES, CHANGE_TWO, '.run', 'base');
    const base = (await git(['show', `${approved}:${baseRef}`], project.repo)).trim();
    assert.equal(base, archiveCommit);
    assert.deepEqual(await commitSubjects(project.repo, worktreeBranch(CHANGE_TWO)), [
      'osq: 002 archived',
      'osq: 002 task 1 verified',
      'osq: 002 approved',
      'osq: 001 archived',
      'osq: 001 task 1 verified',
      'osq: 001 approved',
      'seed',
    ]);
    assert.equal(await exists(stackedRoot(project, CHANGE_TWO)), false);
    assert.equal(await git(['status', '--porcelain'], project.repo), checkout);
  });

  it('waits while the dependency is still running', async () => {
    const project = await makeProject();
    const worktree = await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    // Dirty the dependency worktree so its pending task cannot finish.
    await fs.writeFile(path.join(worktree, OUT_SCOPE), 'dirty\n', 'utf8');

    const adapter = new ActingAdapter();
    await runWatcherOnce(project.repo, project.config, adapter);

    assert.equal(await git(['branch', '--list', worktreeBranch(CHANGE_TWO)], project.repo), '');
    assert.equal(
      await exists(path.join(stackedCopy(project, CHANGE_TWO), '.run', 'regressed', 'change.md')),
      false,
    );
  });

  it('cuts from the default branch when the dependency landed by hand', async () => {
    const project = await makeProject();
    await approveIntoWorktree(project, '001');
    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    await approveSpec(project.repo, '002', project.config);
    await git(['merge', '--squash', worktreeBranch(CHANGE_ONE)], project.repo);
    await git(['commit', '-qm', 'land 001'], project.repo);
    const mainTip = await git(['rev-parse', 'main'], project.repo);

    const logger = new CaptureLogger();
    await runWatcherOnce(project.repo, project.config, new ActingAdapter(), logger);

    assert.ok(
      logger.infos.some((line) => line.startsWith(`stacked ${CHANGE_TWO} on main: worktree `)),
    );
    const approved = await findCommit(
      project.repo,
      'osq: 002 approved',
      worktreeBranch(CHANGE_TWO),
    );
    assert.equal(await git(['rev-parse', `${approved}^`], project.repo), mainTip);
  });

  it('halts when two archived dependencies diverge', async () => {
    const project = await makeProject({ changes: [ONE, { ...TWO, dependsOn: [] }, THREE] });
    await approveIntoWorktree(project, '001');
    await approveIntoWorktree(project, '002');
    await approveSpec(project.repo, '003', project.config);

    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    const marker = await readRegressed(stackedCopy(project, CHANGE_THREE));
    assert.equal(marker.reason, 'dependency_diverged');
    assert.match(marker.body, /001-a and 002-b archived on separate branches/);
    assert.match(marker.body, /approve 003 again/);
    assert.equal(await git(['branch', '--list', worktreeBranch(CHANGE_THREE)], project.repo), '');
  });

  it('halts on a failed prepare and resumes after retry', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stack-prepare-'));
    tmpDirs.push(root);
    const prepareScript = path.join(root, 'prepare.cjs');
    await fs.writeFile(
      prepareScript,
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        "process.exit(fs.existsSync(path.join(__dirname, 'fail-cut')) ? 1 : 0);",
        '',
      ].join('\n'),
      'utf8',
    );
    const project = await makeProject({ prepare: `node ${prepareScript}` });
    await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    await fs.writeFile(path.join(root, 'fail-cut'), '', 'utf8');

    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    const marker = await readRegressed(stackedCopy(project, CHANGE_TWO));
    assert.equal(marker.reason, 'stack_cut_failed');
    assert.equal(await exists(stackedRoot(project, CHANGE_TWO)), true);
    assert.notEqual(await git(['branch', '--list', worktreeBranch(CHANGE_TWO)], project.repo), '');

    await fs.rm(path.join(root, 'fail-cut'), { force: true });
    await retrySpec(project.repo, '2', 'change', project.config);
    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    const subjects = await commitSubjects(project.repo, worktreeBranch(CHANGE_TWO));
    assert.equal(subjects.filter((subject) => subject === 'osq: 002 approved').length, 1);
    assert.equal(await exists(stackedRoot(project, CHANGE_TWO)), false);
  });

  it('does nothing when vcs is off and a stacked directory exists', async () => {
    const project = await makeProject();
    const off = defineConfig({});
    const copy = path.join(project.repo, '.stacked', CHANGE_TWO, CHANGES, CHANGE_TWO);
    await fs.mkdir(path.join(copy, '.run'), { recursive: true });
    await fs.writeFile(path.join(copy, 'proposal.md'), '---\ntitle: Two\n---\n', 'utf8');
    await fs.writeFile(path.join(copy, '.run', 'approved'), 'hash\n', 'utf8');

    await runWatcherOnce(project.repo, off, new ActingAdapter());

    assert.equal(await git(['branch', '--list', worktreeBranch(CHANGE_TWO)], project.repo), '');
    assert.equal(await readTrimmed(path.join(copy, '.run', 'approved')), 'hash');
  });
});

describe('Stacked halt', () => {
  /** Approve `001` into a worktree, stack `002`, then reject `001` on its branch. */
  async function rejectDependency(project: Project): Promise<void> {
    const worktree = await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    await fs.mkdir(path.join(worktree, CHANGES, 'rejected'), { recursive: true });
    await git(
      ['mv', path.join(CHANGES, CHANGE_ONE), path.join(CHANGES, 'rejected', CHANGE_ONE)],
      worktree,
    );
    await git(['commit', '-qm', 'reject 001'], worktree);
  }

  it('halts when the dependency was rejected before it landed', async () => {
    const project = await makeProject();
    await rejectDependency(project);

    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    const marker = await readRegressed(stackedCopy(project, CHANGE_TWO));
    assert.equal(marker.reason, 'dependency_changed');
    assert.match(marker.body, /approve 002 again/);
    assert.match(marker.body, /001-a was rejected or is no longer approved/);
    assert.equal(await git(['branch', '--list', worktreeBranch(CHANGE_TWO)], project.repo), '');
  });

  it('halts when the recorded dependency hash changed', async () => {
    const project = await makeProject();
    await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    const stackedOn = path.join(stackedCopy(project, CHANGE_TWO), '.run', 'stacked-on');
    const lines = (await fs.readFile(stackedOn, 'utf8')).trim().split(' ');
    await fs.writeFile(stackedOn, `${lines[0]} deadbeef\n`, 'utf8');

    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    const marker = await readRegressed(stackedCopy(project, CHANGE_TWO));
    assert.equal(marker.reason, 'dependency_changed');
    assert.match(marker.body, /001-a was approved again after 002; approve 002 again/);
  });

  it('approving again clears the halt and cuts at HEAD', async () => {
    const project = await makeProject();
    await rejectDependency(project);
    await runWatcherOnce(project.repo, project.config, new ActingAdapter());
    assert.equal(await exists(stackedRoot(project, CHANGE_TWO)), true);

    const head = await git(['rev-parse', 'HEAD'], project.repo);
    const result = await approveSpec(project.repo, '002', project.config);

    assert.equal(result.branch, worktreeBranch(CHANGE_TWO));
    assert.equal(result.worktreePath, worktreePath(project.vcs, project.repo, CHANGE_TWO));
    assert.equal(await exists(stackedRoot(project, CHANGE_TWO)), false);
    assert.equal(await git(['rev-parse', `${worktreeBranch(CHANGE_TWO)}^`], project.repo), head);
  });
});
