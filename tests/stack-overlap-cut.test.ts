import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { type OsqConfig, defineConfig } from '../src/core/foundation/config.js';
import { scaffoldProject } from '../src/core/foundation/init.js';
import { approveSpec } from '../src/core/spec/approve.js';
import { type StackCutDecision, decideStackCut } from '../src/core/spec/stack-cut.js';
import { readDependencyState } from '../src/core/spec/stack-dependencies.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { stackedPath, worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.join('openspec', 'changes');
const ARCHIVE = path.join('openspec', 'changes', 'archive');
const REJECTED = path.join('openspec', 'changes', 'rejected');
const IN_SCOPE = 'src/one.txt';

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

async function commitSubjects(cwd: string, ref: string): Promise<string[]> {
  return (await git(['log', '--format=%s', ref], cwd))
    .split('\n')
    .filter((line) => line.trim().length > 0);
}

async function findCommit(cwd: string, subject: string, ref: string): Promise<string> {
  return git(['log', '--format=%H', '-1', '--fixed-strings', `--grep=${subject}`, ref], cwd);
}

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly caps: readonly string[];
}

const ONE: ChangeDef = { folder: '001-a', title: 'One', caps: ['orders'] };
const TWO: ChangeDef = { folder: '002-b', title: 'Two', caps: ['billing'] };
const THREE: ChangeDef = { folder: '003-c', title: 'Three', caps: ['orders', 'billing'] };

function deltaSpec(capability: string): string {
  return [
    `# Spec Delta: ${capability}`,
    '',
    '## Purpose',
    '',
    `The ${capability} capability for the test.`,
    '',
    '## ADDED Requirements',
    '',
    `### Requirement: ${capability} works`,
    '',
    `The ${capability} capability SHALL work.`,
    '',
    `#### Scenario: ${capability} runs`,
    '- **WHEN** it runs',
    '- **THEN** it works',
    '',
  ].join('\n');
}

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
  for (const capability of change.caps) {
    const dir = path.join(folderPath, 'specs', capability);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'spec.md'), deltaSpec(capability), 'utf8');
  }
}

interface Project {
  readonly root: string;
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

async function makeProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stack-overlap-cut-'));
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
    worktreeRoot: worktrees,
  };
  const config = defineConfig({ vcs, gates: { preSpawnVerify: 'off' } });
  return { root, repo, worktrees, config, vcs };
}

/** Fake adapter whose spawn edits one scoped file under the spawn's project root. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    await fs.mkdir(path.dirname(path.join(options.projectRoot, IN_SCOPE)), { recursive: true });
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

function stackedRoot(project: Project, folder: string): string {
  return stackedPath(project.vcs, project.repo, folder);
}

/** Approve `folder` into its worktree and return that worktree's path. */
async function approveIntoWorktree(project: Project, folder: string): Promise<string> {
  const result = await approveSpec(project.repo, folder, project.config);
  assert.ok(result.worktreePath, `expected a worktree for ${folder}`);
  return result.worktreePath;
}

/** Move a freshly approved change into its branch's archive directory. */
async function archiveOnBranch(project: Project, folder: string): Promise<void> {
  const wtPath = worktreePath(project.vcs, project.repo, folder);
  await fs.mkdir(path.join(wtPath, ARCHIVE), { recursive: true });
  await git(['mv', path.join(CHANGES, folder), path.join(ARCHIVE, folder)], wtPath);
  await git(['commit', '-qm', `archive ${folder}`], wtPath);
}

/** Move a freshly approved change into its branch's rejected directory. */
async function rejectOnBranch(project: Project, folder: string): Promise<void> {
  const wtPath = worktreePath(project.vcs, project.repo, folder);
  await fs.mkdir(path.join(wtPath, REJECTED), { recursive: true });
  await git(['mv', path.join(CHANGES, folder), path.join(REJECTED, folder)], wtPath);
  await git(['commit', '-qm', `reject ${folder}`], wtPath);
}

/** Squash-merge a change's archived branch onto `main`. */
async function landOnMain(project: Project, folder: string): Promise<void> {
  await git(['merge', '--squash', worktreeBranch(folder)], project.repo);
  await git(['commit', '-qm', `land ${folder}`], project.repo);
}

/** Give an approved change a different approved hash at its branch tip. */
async function reapproveHash(project: Project, folder: string): Promise<void> {
  const wtPath = worktreePath(project.vcs, project.repo, folder);
  await fs.writeFile(
    path.join(wtPath, CHANGES, folder, '.run', 'approved'),
    'sha256:changed\n',
    'utf8',
  );
  await git(['add', '-A'], wtPath);
  await git(['commit', '-qm', `reapprove ${folder}`], wtPath);
}

async function stateHash(project: Project, folder: string): Promise<string> {
  const vcs = await selectVcs(project.repo, project.config);
  return (await readDependencyState(project.repo, project.config, vcs, folder)).hash ?? '';
}

/** Write the stacked copy of `003-c` with the given `.run/stacked-on` body. */
async function writeStackedCopy(project: Project, body: string): Promise<void> {
  const folderPath = path.join(stackedRoot(project, THREE.folder), CHANGES, THREE.folder);
  await writeChange(folderPath, THREE);
  await fs.mkdir(path.join(folderPath, '.run'), { recursive: true });
  await fs.writeFile(path.join(folderPath, '.run', 'approved'), 'sha256:stacked\n', 'utf8');
  await fs.writeFile(
    path.join(folderPath, '.run', 'stacked-on'),
    body.endsWith('\n') ? body : `${body}\n`,
    'utf8',
  );
}

/** The `003-c` change as the stacked tree's active change. */
async function stackedChange(project: Project): Promise<LocatedChange> {
  const active = await listChanges(project.repo, project.config, ['active']);
  const change = active.find((candidate) => candidate.folderName === THREE.folder);
  assert.ok(change, 'expected 003-c in the stacked tree');
  assert.equal(change.tree.stackedFolder, THREE.folder);
  return change;
}

async function decide(project: Project): Promise<StackCutDecision> {
  const vcs = await selectVcs(project.repo, project.config);
  return decideStackCut({
    projectRoot: project.repo,
    config: project.config,
    change: await stackedChange(project),
    vcs,
  });
}

async function branchExists(project: Project, branch: string): Promise<boolean> {
  return (
    (await git(['branch', '--format=%(refname:short)', '--list', branch], project.repo)) !== ''
  );
}

async function hasChangeRegression(project: Project): Promise<boolean> {
  const folderPath = path.join(stackedRoot(project, THREE.folder), CHANGES, THREE.folder);
  return exists(path.join(folderPath, '.run', 'regressed', 'change.md'));
}

describe('Overlapping changes approved at once', () => {
  it('cuts the overlap stack from the first archive and runs both changes', async () => {
    const project = await makeProject([
      { ...ONE, caps: ['orders'] },
      { ...TWO, caps: ['orders'] },
    ]);
    await approveIntoWorktree(project, ONE.folder);
    await approveSpec(project.repo, TWO.folder, project.config);
    assert.equal(await exists(stackedRoot(project, TWO.folder)), true);
    const checkout = await git(['status', '--porcelain'], project.repo);

    await runWatcherOnce(project.repo, project.config, new ActingAdapter());

    assert.deepEqual(await commitSubjects(project.repo, worktreeBranch(ONE.folder)), [
      'osq: 001 archived',
      'osq: 001 task 1 verified',
      'osq: 001 approved',
      'seed',
    ]);
    const archiveCommit = await git(['rev-parse', worktreeBranch(ONE.folder)], project.repo);
    const approved = await findCommit(
      project.repo,
      'osq: 002 approved',
      worktreeBranch(TWO.folder),
    );
    assert.notEqual(approved, '');
    assert.equal(await git(['rev-parse', `${approved}^`], project.repo), archiveCommit);

    const twoSubjects = await commitSubjects(project.repo, worktreeBranch(TWO.folder));
    assert.equal(twoSubjects[0], 'osq: 002 archived');
    assert.equal(
      twoSubjects.some((subject) => subject.includes('sync main')),
      false,
    );
    assert.equal(await exists(stackedRoot(project, TWO.folder)), false);
    assert.equal(await git(['status', '--porcelain'], project.repo), checkout);
  });
});

describe('Overlap lines in the cut', () => {
  it('cuts from the default branch when the overlapped change was rejected', async () => {
    const project = await makeProject([ONE, TWO, THREE]);
    await approveIntoWorktree(project, ONE.folder);
    await rejectOnBranch(project, ONE.folder);
    await writeStackedCopy(project, `${ONE.folder} sha256:gone overlap orders`);

    const decision = await decide(project);
    assert.deepEqual(decision, { kind: 'cut', base: 'main' });
    assert.equal(await hasChangeRegression(project), false);
    assert.equal(await branchExists(project, worktreeBranch(THREE.folder)), false);
  });

  it('waits when the overlapped change carries another hash', async () => {
    const project = await makeProject([ONE, TWO, THREE]);
    await approveIntoWorktree(project, ONE.folder);
    const hash = await stateHash(project, ONE.folder);
    await writeStackedCopy(project, `${ONE.folder} ${hash} overlap orders`);
    await reapproveHash(project, ONE.folder);

    const decision = await decide(project);
    assert.deepEqual(decision, { kind: 'wait' });
    assert.equal(await hasChangeRegression(project), false);
    assert.equal(await branchExists(project, worktreeBranch(THREE.folder)), false);
  });

  it('waits while the overlapped change is still approved', async () => {
    const project = await makeProject([ONE, TWO, THREE]);
    await approveIntoWorktree(project, ONE.folder);
    await writeStackedCopy(
      project,
      `${ONE.folder} ${await stateHash(project, ONE.folder)} overlap orders`,
    );

    const decision = await decide(project);
    assert.deepEqual(decision, { kind: 'wait' });
    assert.equal(await hasChangeRegression(project), false);
    assert.equal(await branchExists(project, worktreeBranch(THREE.folder)), false);
  });

  it('waits when two overlapped changes archived on separate branches', async () => {
    const project = await makeProject([ONE, TWO, THREE]);
    await approveIntoWorktree(project, ONE.folder);
    await archiveOnBranch(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);
    await archiveOnBranch(project, TWO.folder);
    const body = [
      `${ONE.folder} ${await stateHash(project, ONE.folder)} overlap orders`,
      `${TWO.folder} ${await stateHash(project, TWO.folder)} overlap billing`,
    ].join('\n');
    await writeStackedCopy(project, body);

    const decision = await decide(project);
    assert.deepEqual(decision, { kind: 'wait' });
    assert.equal(await hasChangeRegression(project), false);
    assert.equal(await branchExists(project, worktreeBranch(THREE.folder)), false);
  });

  it('waits when a landed overlap is not held by the remaining archived branch', async () => {
    const project = await makeProject([ONE, TWO, THREE]);
    await approveIntoWorktree(project, ONE.folder);
    const oneHash = await stateHash(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);
    const twoHash = await stateHash(project, TWO.folder);
    await archiveOnBranch(project, TWO.folder);
    await archiveOnBranch(project, ONE.folder);
    await landOnMain(project, ONE.folder);
    const body = [
      `${ONE.folder} ${oneHash} overlap orders`,
      `${TWO.folder} ${twoHash} overlap billing`,
    ].join('\n');
    await writeStackedCopy(project, body);

    const decision = await decide(project);
    assert.deepEqual(decision, { kind: 'wait' });
    assert.equal(await hasChangeRegression(project), false);
    assert.equal(await branchExists(project, worktreeBranch(THREE.folder)), false);
  });

  it('cuts from the default branch when every overlapped change landed', async () => {
    const project = await makeProject([ONE, TWO, THREE]);
    await approveIntoWorktree(project, ONE.folder);
    const oneHash = await stateHash(project, ONE.folder);
    await archiveOnBranch(project, ONE.folder);
    await landOnMain(project, ONE.folder);
    await approveIntoWorktree(project, TWO.folder);
    const twoHash = await stateHash(project, TWO.folder);
    await archiveOnBranch(project, TWO.folder);
    await landOnMain(project, TWO.folder);
    const body = [
      `${ONE.folder} ${oneHash} overlap orders`,
      `${TWO.folder} ${twoHash} overlap billing`,
    ].join('\n');
    await writeStackedCopy(project, body);

    const decision = await decide(project);
    assert.deepEqual(decision, { kind: 'cut', base: 'main' });
    assert.equal(await hasChangeRegression(project), false);
    assert.equal(await branchExists(project, worktreeBranch(THREE.folder)), false);
  });
});
