import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import type { VcsConfig } from '../src/core/foundation/config-vcs.js';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { changeTrees, findChange, listChanges } from '../src/core/status/change-locations.js';
import { stackedPath } from '../src/core/vcs/worktree.js';

const execFileAsync = promisify(execFile);
const CHANGES = path.join('openspec', 'changes');

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

/** Ignore the redirecting variables, like osq's own git reads. */
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

/** A temporary repository with a local identity, ready for a first commit. */
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
}

/** Create the active change `folder` in `root`. */
async function writeChange(root: string, folder: string): Promise<void> {
  const dir = path.join(root, CHANGES, folder);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    ['---', `title: ${folder}`, 'verify: node verify.cjs', 'features:', '  reads: []', '---'].join(
      '\n',
    ),
    'utf8',
  );
}

/** Commit every change folder currently in `repo`. */
async function commitChanges(repo: string): Promise<void> {
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'changes'], repo);
}

interface Setup {
  repo: string;
  wtRoot: string;
  vcs: VcsConfig;
  config: ReturnType<typeof defineConfig>;
}

/** A repository, a worktree root, and a config with vcs enabled. */
async function setupRepo(): Promise<Setup> {
  const tmp = await makeTempDir('osq-stacked-locations-');
  const repo = path.join(tmp, 'repo');
  const wtRoot = path.join(tmp, 'wt');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(wtRoot, { recursive: true });
  await initRepo(repo);
  const vcs: VcsConfig = {
    enabled: true,
    author: 'osq <osq@example.invalid>',
    worktreeRoot: wtRoot,
  };
  return { repo, wtRoot, vcs, config: defineConfig({ vcs }) };
}

/** Build the stacked approval copy of `folder` under the configured root. */
async function writeStacked(vcs: VcsConfig, repo: string, folder: string): Promise<string> {
  const root = stackedPath(vcs, repo, folder);
  const changeDir = path.join(root, CHANGES, folder);
  await fs.mkdir(path.join(changeDir, '.run'), { recursive: true });
  await fs.writeFile(path.join(changeDir, 'proposal.md'), `---\ntitle: ${folder}\n---\n`, 'utf8');
  await fs.writeFile(path.join(changeDir, '.run', 'approved'), 'hash\n', 'utf8');
  return root;
}

describe('Change locations across stacked approvals', () => {
  it('lists a stacked approval as its own tree and drops it from the checkout', async () => {
    const { repo, vcs, config } = await setupRepo();
    await writeChange(repo, '002-b');
    await commitChanges(repo);
    const stacked = await writeStacked(vcs, repo, '002-b');

    const trees = await changeTrees(repo, config);
    assert.equal(trees.length, 2);
    assert.equal(trees[0].root, path.resolve(repo));
    assert.equal(trees[0].worktreeFolder, undefined);
    assert.equal(trees[0].stackedFolder, undefined);
    assert.equal(await fs.realpath(trees[1].root), await fs.realpath(stacked));
    assert.equal(trees[1].stackedFolder, '002-b');
    assert.equal(trees[1].worktreeFolder, undefined);

    const changes = await listChanges(repo, config);
    assert.deepEqual(
      changes.map((change) => [change.folderName, change.tree.stackedFolder]),
      [['002-b', '002-b']],
    );

    const found = await findChange(repo, config, '2');
    assert.equal(found.folderName, '002-b');
    assert.equal(found.tree.stackedFolder, '002-b');
    assert.equal(found.tree.worktreeFolder, undefined);
  });

  it('prefers a worktree over a stacked directory for the same folder', async () => {
    const { repo, wtRoot, vcs, config } = await setupRepo();
    await writeChange(repo, '002-b');
    await commitChanges(repo);
    await git(['branch', 'osq/002-b'], repo);
    const wt = path.join(wtRoot, '002-b');
    await git(['worktree', 'add', wt, 'osq/002-b'], repo);
    const wtRunDir = path.join(wt, CHANGES, '002-b', '.run');
    await fs.mkdir(wtRunDir, { recursive: true });
    await fs.writeFile(path.join(wtRunDir, 'approved'), 'hash\n', 'utf8');
    await writeStacked(vcs, repo, '002-b');

    const trees = await changeTrees(repo, config);
    assert.equal(trees.length, 2);
    assert.equal(trees[0].stackedFolder, undefined);
    assert.equal(trees[1].worktreeFolder, '002-b');
    assert.equal(trees[1].stackedFolder, undefined);

    const changes = await listChanges(repo, config);
    assert.deepEqual(
      changes.map((change) => [change.folderName, change.tree.worktreeFolder]),
      [['002-b', '002-b']],
    );
  });

  it('returns exactly one tree when vcs is off even if a stacked directory exists', async () => {
    const root = await makeTempDir('osq-stacked-off-');
    await writeChange(root, '001-a');
    await fs.mkdir(path.join(root, '.stacked', '001-a'), { recursive: true });

    const trees = await changeTrees(root, DEFAULT_CONFIG);
    assert.equal(trees.length, 1);
    assert.equal(trees[0].root, path.resolve(root));
    assert.equal(trees[0].stackedFolder, undefined);

    const changes = await listChanges(root, DEFAULT_CONFIG);
    assert.deepEqual(
      changes.map((change) => change.folderName),
      ['001-a'],
    );
  });
});
