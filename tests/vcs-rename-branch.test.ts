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

/** A temporary repository with one commit and a `GitVcs` over its root. */
async function makeRepo(prefix: string): Promise<{ root: string; vcs: GitVcs }> {
  const parent = await makeTempDir(prefix);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  return { root, vcs: new GitVcs(root, DEFAULT_CONFIG) };
}

describe('renameBranch', () => {
  it('renames a branch and keeps every commit it holds', async () => {
    const { root, vcs } = await makeRepo('osq-rename-keep-');
    const sha = await git(['rev-parse', 'HEAD'], root);
    await vcs.createBranch('osq/001-a', sha);

    await vcs.renameBranch('osq/001-a', 'osq/001-a-rejected-1');

    assert.equal(await git(['rev-parse', 'osq/001-a-rejected-1'], root), sha);
    assert.ok(!(await vcs.listBranches('osq/001-a')).includes('osq/001-a'));
  });

  it('fails, changing nothing, when the new name is taken', async () => {
    const { root, vcs } = await makeRepo('osq-rename-taken-');
    const sha = await git(['rev-parse', 'HEAD'], root);
    await vcs.createBranch('osq/001-a', sha);
    await git(['branch', 'osq/001-b', sha], root);

    await assert.rejects(() => vcs.renameBranch('osq/001-a', 'osq/001-b'));

    assert.equal(await git(['rev-parse', 'osq/001-a'], root), sha);
    assert.equal(await git(['rev-parse', 'osq/001-b'], root), sha);
  });

  it('fails through NoVcs naming the reason git is off', async () => {
    const vcs = new NoVcs('not a git repository');
    await assert.rejects(() => vcs.renameBranch('osq/001-a', 'osq/001-b'), /not a git repository/);
  });
});
