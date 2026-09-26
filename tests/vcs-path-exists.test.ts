import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { GitVcs } from '../src/core/vcs/git-vcs.js';
import { NoVcs } from '../src/core/vcs/no-vcs.js';
import { stackedPath } from '../src/core/vcs/worktree.js';

const execFileAsync = promisify(execFile);

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

/** Create a temporary repository with a local identity and one commit. */
async function initRepo(dir: string): Promise<string> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

describe('Vcs pathExists', () => {
  it('answers whether a file or directory exists at a branch', async () => {
    const parent = await makeTempDir('osq-path-exists-');
    const root = path.join(parent, 'repo');
    await fs.mkdir(root);
    await initRepo(root);
    const vcs = new GitVcs(root, DEFAULT_CONFIG);

    const worktree = path.join(parent, 'wt');
    await vcs.createBranch('osq/001-a', 'main');
    await vcs.worktreeAdd(worktree, 'osq/001-a');
    await fs.mkdir(path.join(worktree, 'dir'));
    await fs.writeFile(path.join(worktree, 'dir', 'notes.txt'), 'hello\n', 'utf8');
    await git(['add', '-A'], worktree);
    await git(['commit', '-qm', 'notes'], worktree);

    assert.equal(await vcs.pathExists('osq/001-a', 'dir'), true);
    assert.equal(await vcs.pathExists('osq/001-a', 'dir/notes.txt'), true);
    assert.equal(await vcs.pathExists('osq/001-a', 'other'), false);
    assert.equal(await vcs.pathExists('main', 'dir'), false);
    assert.equal(await vcs.pathExists('osq/none', 'dir'), false);

    const noVcs = new NoVcs('not a git repository');
    assert.equal(await noVcs.pathExists('osq/001-a', 'dir'), false);
  });

  it('places a stacked approval under .stacked', () => {
    assert.equal(
      stackedPath({ enabled: false, worktreeRoot: '/tmp/wt' }, '/src/osq', '094-stacking'),
      '/tmp/wt/osq/.stacked/094-stacking',
    );
    assert.equal(
      stackedPath({ enabled: false, worktreeRoot: '~/wt' }, '/src/osq', '094-stacking', '/home/u'),
      path.join('/home/u/wt/osq/.stacked/094-stacking'),
    );
    assert.equal(
      stackedPath({ enabled: false }, '/src/osq', '094-stacking', '/home/u'),
      path.join('/home/u/.osq/worktrees/osq/.stacked/094-stacking'),
    );
  });
});
