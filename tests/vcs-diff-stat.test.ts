import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { GitVcs } from '../src/core/vcs/git-vcs.js';
import { selectVcs } from '../src/core/vcs/select.js';

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
  await fs.writeFile(path.join(dir, 'b.txt'), 'one\ntwo\nthree\n', 'utf8');
  await fs.writeFile(path.join(dir, 'c.txt'), 'c\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

interface Scenario {
  readonly parent: string;
  readonly root: string;
  readonly vcs: GitVcs;
}

/**
 * A repository with `side` cut from `main`: `side` adds a three-line `a.txt`
 * and removes one line of `b.txt`, then `main` changes `c.txt`.
 */
async function makeRepo(prefix: string): Promise<Scenario> {
  const parent = await makeTempDir(prefix);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await initRepo(root);

  await git(['checkout', '-q', '-b', 'side'], root);
  await fs.writeFile(path.join(root, 'a.txt'), 'x\ny\nz\n', 'utf8');
  await fs.writeFile(path.join(root, 'b.txt'), 'one\nthree\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'side work'], root);

  await git(['checkout', '-q', 'main'], root);
  await fs.writeFile(path.join(root, 'c.txt'), 'changed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'main work'], root);
  await git(['checkout', '-q', 'side'], root);

  return { parent, root, vcs: new GitVcs(root, DEFAULT_CONFIG) };
}

describe('Vcs diffStat', () => {
  it('counts a branch work from its merge base', async () => {
    const { vcs } = await makeRepo('osq-diffstat-base-');
    assert.deepEqual(await vcs.diffStat('main', 'side', []), {
      files: 2,
      added: 3,
      removed: 1,
    });
  });

  it('excludes a folder and counts a binary file as one file with no lines', async () => {
    const { root, vcs } = await makeRepo('osq-diffstat-exclude-');
    await fs.mkdir(path.join(root, 'openspec'), { recursive: true });
    await fs.writeFile(path.join(root, 'openspec', 'x.md'), 'x\n', 'utf8');
    await fs.writeFile(path.join(root, 'logo.png'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
    await git(['add', '-A'], root);
    await git(['commit', '-qm', 'extra'], root);

    const all = await vcs.diffStat('main', 'side', []);
    assert.deepEqual(all, { files: 4, added: 4, removed: 1 });

    const excluded = await vcs.diffStat('main', 'side', ['openspec']);
    assert.deepEqual(excluded, { files: 3, added: 3, removed: 1 });
  });

  it('returns null for an unknown ref', async () => {
    const { vcs } = await makeRepo('osq-diffstat-unknown-');
    assert.equal(await vcs.diffStat('main', 'osq/none', []), null);
  });

  it('returns null under the NoVcs selected for a folder with no git', async () => {
    const dir = await makeTempDir('osq-diffstat-nogit-');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.equal(vcs.kind, 'none');
    assert.equal(await vcs.diffStat('main', 'side', []), null);
  });
});
