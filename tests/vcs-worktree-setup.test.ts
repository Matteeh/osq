import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  DEFAULT_BRANCH,
  DEFAULT_VCS_CONFIG,
  DEFAULT_WORKTREE_ROOT,
} from '../src/core/foundation/config-vcs.js';
import { defineConfig, loadConfig } from '../src/core/foundation/config.js';
import { GitVcs } from '../src/core/vcs/git-vcs.js';
import { worktreeBranch, worktreePath } from '../src/core/vcs/worktree.js';

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

describe('Vcs config defaults', () => {
  it('names the default branch and worktree root and keeps vcs off', () => {
    assert.equal(DEFAULT_BRANCH, 'main');
    assert.equal(DEFAULT_WORKTREE_ROOT, '~/.osq/worktrees');
    assert.deepEqual(DEFAULT_VCS_CONFIG, { enabled: false });
  });

  it('trims defaultBranch loaded through loadConfig', async () => {
    const dir = await makeTempDir('osq-wt-config-');
    await fs.writeFile(
      path.join(dir, 'osq.config.ts'),
      "export default { vcs: { defaultBranch: ' trunk ' } };",
      'utf8',
    );
    assert.equal((await loadConfig(dir)).vcs?.defaultBranch, 'trunk');
  });

  it('rejects a blank defaultBranch loaded through loadConfig', async () => {
    const dir = await makeTempDir('osq-wt-config-blank-');
    await fs.writeFile(
      path.join(dir, 'osq.config.ts'),
      "export default { vcs: { defaultBranch: '   ' } };",
      'utf8',
    );
    await assert.rejects(
      loadConfig(dir),
      /vcs\.defaultBranch must be a non-empty string if provided/,
    );
  });
});

describe('Vcs port default branch', () => {
  it('reads origin\u2019s default branch ahead of vcs.defaultBranch', async () => {
    const dir = await makeTempDir('osq-wt-origin-');
    await initRepo(dir);
    await git(['update-ref', 'refs/remotes/origin/trunk', 'HEAD'], dir);
    await git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'], dir);
    const vcs = new GitVcs(dir, defineConfig({ vcs: { defaultBranch: 'develop' } }));
    assert.equal(await vcs.defaultBranch(), 'trunk');
  });

  it('falls back to vcs.defaultBranch without a remote, then main', async () => {
    const dir = await makeTempDir('osq-wt-noremote-');
    await initRepo(dir);
    const withConfig = new GitVcs(dir, defineConfig({ vcs: { defaultBranch: 'develop' } }));
    assert.equal(await withConfig.defaultBranch(), 'develop');
    const withoutConfig = new GitVcs(dir, defineConfig({}));
    assert.equal(await withoutConfig.defaultBranch(), 'main');
  });
});

describe('Worktree location', () => {
  it('uses the default root under the home directory', () => {
    assert.equal(worktreeBranch('089-approve-into-worktree'), 'osq/089-approve-into-worktree');
    assert.equal(
      worktreePath(DEFAULT_VCS_CONFIG, '/src/osq', '089-approve-into-worktree', '/home/u'),
      '/home/u/.osq/worktrees/osq/089-approve-into-worktree',
    );
  });

  it('uses the configured root and expands a leading tilde to the home directory', () => {
    assert.equal(
      worktreePath(
        { enabled: false, worktreeRoot: '/tmp/wt' },
        '/src/osq',
        '089-approve-into-worktree',
      ),
      '/tmp/wt/osq/089-approve-into-worktree',
    );
    assert.equal(
      worktreePath({ enabled: false, worktreeRoot: '~/wt' }, '/src/osq', 'c', '/home/u'),
      path.join('/home/u/wt/osq/c'),
    );
  });
});
