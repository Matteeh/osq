import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, defineConfig } from '../src/core/foundation/config.js';
import { changeTrees, findChange, listChanges } from '../src/core/status/change-locations.js';

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

/** Create change `folder` with a proposal and one unstarted task. */
async function writeChange(root: string, folder: string): Promise<void> {
  const dir = path.join(root, CHANGES, folder);
  await fs.mkdir(path.join(dir, 'tasks'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'proposal.md'),
    [
      '---',
      `title: ${folder}`,
      'verify: node verify.cjs',
      'features:',
      '  reads: []',
      '---',
      '## Goal',
      'Do the thing.',
    ].join('\n'),
    'utf8',
  );
  await fs.writeFile(
    path.join(dir, 'tasks', '1.md'),
    [
      '---',
      'title: A task',
      'verify: node verify.cjs',
      'scope: []',
      'entry: []',
      'skills: []',
      '---',
      '## Acceptance',
      '- [ ] does work',
    ].join('\n'),
    'utf8',
  );
}

/** A repository, a worktree root, and a config with vcs enabled. */
async function setupRepo(): Promise<{
  repo: string;
  wtRoot: string;
  config: ReturnType<typeof defineConfig>;
}> {
  const tmp = await makeTempDir('osq-worktree-locations-');
  const repo = path.join(tmp, 'repo');
  const wtRoot = path.join(tmp, 'wt');
  await fs.mkdir(repo, { recursive: true });
  await fs.mkdir(wtRoot, { recursive: true });
  await initRepo(repo);
  const config = defineConfig({
    vcs: { enabled: true, author: 'osq <osq@example.org>', worktreeRoot: wtRoot },
  });
  return { repo, wtRoot, config };
}

/** Commit every change folder currently in `repo`. */
async function commitChanges(repo: string): Promise<void> {
  await git(['add', '-A'], repo);
  await git(['commit', '-qm', 'changes'], repo);
}

describe('Change locations across osq worktrees', () => {
  it('reports a running change in a worktree and drops it from the checkout', async () => {
    const { repo, wtRoot, config } = await setupRepo();
    await writeChange(repo, '001-a');
    await writeChange(repo, '002-b');
    await commitChanges(repo);
    await git(['branch', 'osq/001-a'], repo);
    const wt = path.join(wtRoot, '001-a');
    await git(['worktree', 'add', wt, 'osq/001-a'], repo);
    const runDir = path.join(wt, CHANGES, '001-a', '.run');
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'approved'), 'hash\n', 'utf8');

    const trees = await changeTrees(repo, config);
    assert.equal(trees.length, 2);
    assert.equal(trees[0].root, repo);
    assert.equal(trees[0].worktreeFolder, undefined);
    assert.equal(await fs.realpath(trees[1].root), await fs.realpath(wt));
    assert.equal(trees[1].worktreeFolder, '001-a');

    const changes = await listChanges(repo, config);
    assert.deepEqual(
      changes.map((change) => [change.folderName, change.tree.worktreeFolder !== undefined]),
      [
        ['001-a', true],
        ['002-b', false],
      ],
    );

    const found = await findChange(repo, config, '1');
    assert.equal(found.folderName, '001-a');
    assert.equal(found.tree.worktreeFolder, '001-a');
    assert.equal(found.folderPath, path.join(trees[1].root, CHANGES, '001-a'));
  });

  it('returns no tree for a worktree on a branch that is not an osq branch', async () => {
    const { repo, wtRoot, config } = await setupRepo();
    await writeChange(repo, '001-a');
    await commitChanges(repo);
    await git(['branch', 'feature'], repo);
    await git(['worktree', 'add', path.join(wtRoot, 'feature'), 'feature'], repo);

    const trees = await changeTrees(repo, config);
    assert.equal(trees.length, 1);
    assert.equal(trees[0].root, repo);
    assert.equal(trees[0].worktreeFolder, undefined);

    const changes = await listChanges(repo, config);
    assert.deepEqual(
      changes.map((change) => change.folderName),
      ['001-a'],
    );
  });

  it('returns exactly one tree when vcs is off', async () => {
    const root = await makeTempDir('osq-worktree-off-');
    await writeChange(root, '001-a');

    const trees = await changeTrees(root, DEFAULT_CONFIG);

    assert.equal(trees.length, 1);
    assert.equal(trees[0].root, path.resolve(root));
    assert.equal(trees[0].worktreeFolder, undefined);
  });
});
