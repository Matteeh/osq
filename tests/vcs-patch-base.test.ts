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

interface Scenario {
  readonly parent: string;
  readonly root: string;
  /** Commit B, before the change. */
  readonly base: string;
  readonly vcs: GitVcs;
}

/**
 * A repository with commit `B` holding `a.txt` and `b.txt`, a later commit
 * changing `a.txt`, an uncommitted change to `b.txt`, and an untracked `c.txt`.
 */
async function makeRepo(prefix: string): Promise<Scenario> {
  const parent = await makeTempDir(prefix);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'a.txt'), 'base a\n', 'utf8');
  await fs.writeFile(path.join(root, 'b.txt'), 'base b\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'base'], root);
  const base = await git(['rev-parse', 'HEAD'], root);

  await fs.writeFile(path.join(root, 'a.txt'), 'changed a\n', 'utf8');
  await git(['commit', '-qam', 'after base'], root);

  await fs.writeFile(path.join(root, 'b.txt'), 'dirty b\n', 'utf8');
  await fs.writeFile(path.join(root, 'c.txt'), 'untracked c\n', 'utf8');
  return { parent, root, base, vcs: new GitVcs(root, DEFAULT_CONFIG) };
}

describe('Vcs patch against a base', () => {
  it('diffs all work against the base and only the work against HEAD', async () => {
    const { base, vcs } = await makeRepo('osq-vcsp-base-');
    const before = await vcs.indexDigest();

    const againstBase = await vcs.patch(base);
    assert.match(againstBase, /a\.txt/);
    assert.match(againstBase, /b\.txt/);
    assert.match(againstBase, /c\.txt/);

    const againstHead = await vcs.patch();
    assert.doesNotMatch(againstHead, /a\.txt/);
    assert.match(againstHead, /b\.txt/);
    assert.match(againstHead, /c\.txt/);

    assert.equal(await vcs.indexDigest(), before);
  });

  it('applies patch(base) to a clean checkout of the base to reproduce the tree', async () => {
    const { parent, root, base, vcs } = await makeRepo('osq-vcsp-apply-');
    const patch = await vcs.patch(base);

    const clean = path.join(parent, 'clean');
    await git(['clone', '-q', root, clean], parent);
    await git(['checkout', '-q', base], clean);
    const patchFile = path.join(parent, 'base.patch');
    await fs.writeFile(patchFile, patch, 'utf8');
    await git(['apply', patchFile], clean);

    assert.equal(await fs.readFile(path.join(clean, 'a.txt'), 'utf8'), 'changed a\n');
    assert.equal(await fs.readFile(path.join(clean, 'b.txt'), 'utf8'), 'dirty b\n');
    assert.equal(await fs.readFile(path.join(clean, 'c.txt'), 'utf8'), 'untracked c\n');
  });

  it('NoVcs patch still rejects with and without a base', async () => {
    const vcs = new NoVcs('not a git repository');
    await assert.rejects(() => vcs.patch('abc123'), /not a git repository/);
    await assert.rejects(() => vcs.patch(), /not a git repository/);
  });
});
