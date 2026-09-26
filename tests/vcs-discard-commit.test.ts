import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { type GitWriteContext, discard } from '../src/core/vcs/git-vcs-write.js';
import { GitVcs, runGit } from '../src/core/vcs/git-vcs.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = 'Osq Author <author@example.invalid>';

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

interface Scenario {
  readonly root: string;
  readonly worktree: string;
  readonly vcs: GitVcs;
  /** The context whose `run` records every argument list it is handed. */
  readonly ctx: GitWriteContext;
  readonly calls: string[][];
}

/** A temporary repository plus a linked worktree checked out on `osq/001-a`. */
async function makeWorktree(prefix: string): Promise<Scenario> {
  const parent = await makeTempDir(prefix);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);

  const vcs = new GitVcs(root, DEFAULT_CONFIG);
  const worktree = path.join(parent, 'wt');
  await vcs.createBranch('osq/001-a', 'main');
  await vcs.worktreeAdd(worktree, 'osq/001-a');

  const calls: string[][] = [];
  const run = async (args: string[], env?: NodeJS.ProcessEnv) => {
    calls.push(args);
    return runGit('git', args, worktree, 10, env);
  };
  const ctx: GitWriteContext = { projectRoot: worktree, run, runCommit: run };
  return { root, worktree, vcs: new GitVcs(worktree, DEFAULT_CONFIG), ctx, calls };
}

describe('Vcs discard and commit', () => {
  it('discard with no paths runs no git command and keeps the untracked file', async () => {
    const { worktree, ctx, calls } = await makeWorktree('osq-vcsdc-nopaths-');
    await fs.writeFile(path.join(worktree, 'untracked.txt'), 'new\n', 'utf8');

    await discard(ctx, []);

    assert.deepEqual(calls, []);
    assert.equal(await fs.readFile(path.join(worktree, 'untracked.txt'), 'utf8'), 'new\n');
  });

  it('discard restores staged changes and removes a staged new file', async () => {
    const { worktree, vcs } = await makeWorktree('osq-vcsdc-staged-');
    await fs.writeFile(path.join(worktree, 'seed.txt'), 'modified\n', 'utf8');
    await fs.writeFile(path.join(worktree, 'new.txt'), 'brand new\n', 'utf8');
    await git(['add', '--', 'seed.txt', 'new.txt'], worktree);

    await vcs.discard(['seed.txt', 'new.txt']);

    await assert.rejects(() => fs.readFile(path.join(worktree, 'new.txt')), /ENOENT/);
    assert.equal(await fs.readFile(path.join(worktree, 'seed.txt'), 'utf8'), 'seed\n');
    assert.equal(await git(['show', 'HEAD:seed.txt'], worktree), 'seed');
    assert.equal(await git(['diff', '--cached', '--name-only'], worktree), '');
    assert.deepEqual(await vcs.status(), []);
  });

  it('commit records only the given path and leaves other staged paths staged', async () => {
    const { worktree, vcs } = await makeWorktree('osq-vcsdc-commit-');
    await fs.writeFile(path.join(worktree, 'a.txt'), 'a\n', 'utf8');
    await fs.writeFile(path.join(worktree, 'b.txt'), 'b\n', 'utf8');
    await git(['add', '--', 'a.txt'], worktree);

    const sha = await vcs.commit(['b.txt'], 'only b', GIT_AUTHOR);

    const tree = (await git(['ls-tree', '-r', '--name-only', sha], worktree)).split('\n');
    assert.ok(tree.includes('b.txt'));
    assert.ok(!tree.includes('a.txt'));
    assert.equal(await git(['diff', '--cached', '--name-only'], worktree), 'a.txt');
  });

  it('commit with no paths commits the index as it stands', async () => {
    const { worktree, vcs } = await makeWorktree('osq-vcsdc-index-');
    await fs.writeFile(path.join(worktree, 'a.txt'), 'a\n', 'utf8');
    await git(['add', '--', 'a.txt'], worktree);

    const sha = await vcs.commit([], 'index commit', GIT_AUTHOR);

    const tree = (await git(['ls-tree', '-r', '--name-only', sha], worktree)).split('\n');
    assert.ok(tree.includes('a.txt'));
  });
});
