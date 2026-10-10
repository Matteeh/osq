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
import { approveSpec } from '../src/core/spec/approve.js';
import { mergeDelta, parseDelta } from '../src/core/spec/delta.js';
import { type LocatedChange, listChanges } from '../src/core/status/change-locations.js';
import { landChange } from '../src/core/vcs/land.js';
import { syncWithDefaultBranch } from '../src/core/vcs/sync-main.js';
import { worktreeBranch } from '../src/core/vcs/worktree.js';
import type { HarnessAdapter, SpawnResult, SpawnTaskOptions } from '../src/harness/types.js';
import { runWatcherOnce } from '../src/watcher/loop.js';
import { installFakeValidator } from './helpers.js';

const execFileAsync = promisify(execFile);

const CHANGES = path.posix.join('openspec', 'changes');
const ARCHIVE = path.posix.join(CHANGES, 'archive');
const ORDERS = path.posix.join('openspec', 'specs', 'orders', 'spec.md');
const IN_SCOPE = 'src/one.txt';
const BOGUS_SHA = '0'.repeat(40);

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

const ADD_003 = `# Spec Delta: orders

## Purpose

Adds order 003.

## ADDED Requirements

### Requirement: Order 003
The system SHALL add order 003.

#### Scenario: 003 runs
- **WHEN** 003 runs
- **THEN** order 003 is added
`;

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

interface ChangeDef {
  readonly folder: string;
  readonly title: string;
  readonly dependsOn: readonly string[];
  readonly scope: string;
  readonly delta: string;
}

const ONE: ChangeDef = {
  folder: '001-a',
  title: 'One',
  dependsOn: [],
  scope: IN_SCOPE,
  delta: ADD_001,
};
const TWO: ChangeDef = {
  folder: '002-b',
  title: 'Two',
  dependsOn: ['001'],
  scope: IN_SCOPE,
  delta: ADD_002,
};
const THREE: ChangeDef = {
  folder: '003-c',
  title: 'Three',
  dependsOn: ['002'],
  scope: IN_SCOPE,
  delta: ADD_003,
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
    `scope: ${JSON.stringify([change.scope])}`,
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
  await writeAt(folderPath, path.posix.join('specs', 'orders', 'spec.md'), change.delta);
}

interface Project {
  readonly repo: string;
  readonly worktrees: string;
  readonly config: OsqConfig;
  readonly vcs: VcsConfig;
}

async function makeProject(changes: readonly ChangeDef[]): Promise<Project> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-stacked-land-'));
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
    worktreeRoot: worktrees,
  };
  const config = defineConfig({
    vcs,
    gates: { ...DEFAULT_GATES_CONFIG, preSpawnVerify: 'off', autoRetries: 0 },
  });
  return { repo, worktrees, config, vcs };
}

/** Fake adapter whose spawn writes `<change folder> task <n>` into the one scope. */
class ActingAdapter implements HarnessAdapter {
  readonly name = 'acting';

  async setup(): Promise<void> {}

  async spawn(options: SpawnTaskOptions): Promise<SpawnResult> {
    const folder = path.basename(options.specFolderPath);
    const target = options.scope[0] ?? IN_SCOPE;
    await fs.writeFile(
      path.join(options.projectRoot, target),
      `${folder} task ${options.taskNumber}\n`,
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

async function approveIntoWorktree(project: Project, id: string): Promise<void> {
  const result = await approveSpec(project.repo, id, project.config);
  assert.ok(result.worktreePath, `approval created a worktree for ${id}`);
}

/** Whether `folder`'s archive folder exists on its branch. */
async function isArchived(repo: string, folder: string): Promise<boolean> {
  return git(['cat-file', '-e', `${worktreeBranch(folder)}:${ARCHIVE}/${folder}`], repo)
    .then(() => true)
    .catch(() => false);
}

/** Run the watcher until every named change archived on its branch. */
async function archiveUntil(project: Project, folders: readonly string[]): Promise<void> {
  for (let cycle = 0; cycle < 10; cycle += 1) {
    const archived = await Promise.all(folders.map((folder) => isArchived(project.repo, folder)));
    if (archived.every(Boolean)) return;
    await runWatcherOnce(project.repo, project.config, new ActingAdapter());
  }
  throw new Error(`changes did not archive: ${folders.join(', ')}`);
}

async function archivedChange(project: Project, folder: string): Promise<LocatedChange> {
  const located = (await listChanges(project.repo, project.config, ['archived'])).find(
    (entry) => entry.folderName === folder,
  );
  assert.ok(located, `locate archived ${folder}`);
  return located;
}

async function land(project: Project, id: string): Promise<void> {
  const result = await landChange(project.repo, project.config, id);
  assert.equal(result.code, 0, result.lines.join('\n'));
}

describe('Stacked land', () => {
  it('lands a three-change stack in order and merges a bridge on the stacked branch', async () => {
    const project = await makeProject([ONE, TWO, THREE]);
    const seed = await git(['rev-parse', 'main'], project.repo);
    await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    await approveSpec(project.repo, '003', project.config);
    await archiveUntil(project, [ONE.folder, TWO.folder, THREE.folder]);

    const oneTip = await git(['rev-parse', worktreeBranch(ONE.folder)], project.repo);

    await land(project, '001');
    const mainAfterOne = await git(['rev-parse', 'main'], project.repo);
    const oneArchive = await git(['rev-parse', `main:${ARCHIVE}/${ONE.folder}`], project.repo);

    await land(project, '002');
    const twoBranch = worktreeBranch(TWO.folder);
    const syncTwo = await git(['rev-parse', twoBranch], project.repo);
    assert.equal(
      await git(['log', '-1', '--format=%s', syncTwo], project.repo),
      'osq: 002 sync main',
    );
    const syncParents = (await git(['log', '-1', '--format=%P', syncTwo], project.repo)).split(' ');
    assert.equal(syncParents.length, 2);
    const bridge = syncParents[1] ?? '';
    assert.equal(
      await git(['log', '-1', '--format=%s', bridge], project.repo),
      'osq: 002 bridge main',
    );
    assert.equal(
      await git(['rev-parse', `${bridge}^{tree}`], project.repo),
      await git(['rev-parse', `${mainAfterOne}^{tree}`], project.repo),
    );
    assert.deepEqual(
      (await git(['rev-list', '--parents', '-n', '1', bridge], project.repo)).split(' '),
      [bridge, mainAfterOne, oneTip],
    );
    const reaches = (
      await git(['branch', '--contains', bridge, '--format=%(refname:short)'], project.repo)
    )
      .split('\n')
      .filter((line) => line.length > 0);
    assert.deepEqual(reaches, [twoBranch]);
    assert.equal(
      await git(['rev-parse', `${twoBranch}:${ARCHIVE}/${ONE.folder}`], project.repo),
      oneArchive,
    );
    assert.equal(await git(['show', `${twoBranch}:${IN_SCOPE}`], project.repo), '002-b task 1');
    const ordersTwo = await git(['show', `${twoBranch}:${ORDERS}`], project.repo);
    assert.ok(ordersTwo.includes('Order 001'));
    assert.ok(ordersTwo.includes('Order 002'));
    const markers = await git(['grep', '-l', '--fixed-strings', '<<<<<<<', twoBranch], project.repo)
      .then((output) => output)
      .catch(() => '');
    assert.equal(markers, '');

    await land(project, '003');

    assert.equal(await git(['show', `main:${IN_SCOPE}`], project.repo), '003-c task 1');
    const landCommits = (await git(['rev-list', `${seed}..main`], project.repo)).split('\n');
    assert.equal(landCommits.length, 3);
    for (const commit of landCommits) {
      const line = await git(['rev-list', '--parents', '-n', '1', commit], project.repo);
      assert.equal(line.split(' ').length, 2, `${commit} should have one parent`);
    }
  });

  it('merges the default branch for an unrelated change and rebuilds the shared capability', async () => {
    const unrelated: ChangeDef = { ...TWO, dependsOn: [], scope: 'src/two.txt' };
    const project = await makeProject([ONE, unrelated]);
    await approveIntoWorktree(project, '001');
    await approveIntoWorktree(project, '002');
    await archiveUntil(project, [ONE.folder, TWO.folder]);

    await land(project, '001');
    const mainAfterOne = await git(['rev-parse', 'main'], project.repo);
    const mainOrders = await git(['show', `main:${ORDERS}`], project.repo);

    await land(project, '002');

    const twoBranch = worktreeBranch(TWO.folder);
    const syncCommit = await git(['rev-parse', twoBranch], project.repo);
    assert.equal(
      await git(['log', '-1', '--format=%s', syncCommit], project.repo),
      'osq: 002 sync main',
    );
    const parents = (await git(['log', '-1', '--format=%P', syncCommit], project.repo)).split(' ');
    assert.equal(parents[1], mainAfterOne);

    const branchOrders = await git(['show', `${twoBranch}:${ORDERS}`], project.repo);
    assert.equal(branchOrders, mergeDelta(mainOrders, 'orders', parseDelta(ADD_002)).trim());
    assert.ok(branchOrders.includes('Order 001'));
    assert.ok(branchOrders.includes('Order 002'));
    assert.ok(!branchOrders.includes('<<<<<<<'));
  });

  it('merges the default branch when a landed tip is missing from the repository', async () => {
    const project = await makeProject([ONE, TWO]);
    await approveIntoWorktree(project, '001');
    await approveSpec(project.repo, '002', project.config);
    await archiveUntil(project, [ONE.folder, TWO.folder]);

    await writeAt(project.repo, 'src/hand.txt', 'hand\n');
    await git(['add', '--', 'src/hand.txt'], project.repo);
    await git(['commit', '-qm', 'hand land', '--trailer', `Osq-Head: ${BOGUS_SHA}`], project.repo);
    const mainTip = await git(['rev-parse', 'main'], project.repo);

    const change = await archivedChange(project, TWO.folder);
    const result = await syncWithDefaultBranch(project.repo, project.config, change);

    assert.deepEqual(result, { merged: true });
    const twoBranch = worktreeBranch(TWO.folder);
    const syncCommit = await git(['rev-parse', twoBranch], project.repo);
    assert.equal(
      await git(['log', '-1', '--format=%s', syncCommit], project.repo),
      'osq: 002 sync main',
    );
    const parents = (await git(['log', '-1', '--format=%P', syncCommit], project.repo)).split(' ');
    assert.equal(parents[1], mainTip);
  });
});
