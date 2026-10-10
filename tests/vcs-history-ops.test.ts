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

/** Create a temporary repository, with a local identity and one commit. */
async function initRepo(dir: string): Promise<string> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

interface Scenario {
  readonly parent: string;
  readonly root: string;
  readonly vcs: GitVcs;
}

/** A temp parent holding a git repository whose branches the tests move. */
async function makeRepo(prefix: string): Promise<Scenario> {
  const parent = await makeTempDir(prefix);
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await initRepo(root);
  return { parent, root, vcs: new GitVcs(root, DEFAULT_CONFIG) };
}

/** Commit one small file on the current branch. */
async function commitFile(
  root: string,
  file: string,
  contents: string,
  message: string,
): Promise<void> {
  await fs.writeFile(path.join(root, file), contents, 'utf8');
  await git(['add', '--', file], root);
  await git(['commit', '-qm', message], root);
}

describe('Vcs history reads', () => {
  it('finds the merge base of two branches and answers null for a missing ref', async () => {
    const { root, vcs } = await makeRepo('osq-vcsh-mergebase-');
    const base = await git(['rev-parse', 'HEAD'], root);
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'side.txt', 'side\n', 'side one');
    await git(['checkout', '-q', 'main'], root);
    await commitFile(root, 'main.txt', 'main\n', 'main one');

    assert.equal(await vcs.mergeBase('main', 'side'), base);
    assert.equal(await vcs.mergeBase('main', 'missing'), null);
  });

  it('reads trailer values from a range newest first and answers empty for no range', async () => {
    const { root, vcs } = await makeRepo('osq-vcsh-trailers-');
    const base = await git(['rev-parse', 'HEAD'], root);
    await git(['commit', '--allow-empty', '-qm', 'X', '--trailer', 'Osq-Head: h1'], root);
    await git(['commit', '--allow-empty', '-qm', 'Y'], root);
    await git(['commit', '--allow-empty', '-qm', 'Z', '--trailer', 'Osq-Head: h2'], root);

    assert.deepEqual(await vcs.trailerValues(base, 'main', 'Osq-Head'), ['h2', 'h1']);
    assert.deepEqual(await vcs.trailerValues('main', 'main', 'Osq-Head'), []);
    assert.deepEqual(await vcs.trailerValues('missing', 'main', 'Osq-Head'), []);
  });

  it('answers history reads without git', async () => {
    const vcs = new NoVcs('not a git repository');
    assert.equal(await vcs.mergeBase('main', 'side'), null);
    assert.deepEqual(await vcs.trailerValues('main', 'side', 'Osq-Head'), []);
  });
});

describe('Vcs commitTree with extra parents', () => {
  it('commits a tree with the parent and each extra parent in order, writing nothing', async () => {
    const { root, vcs } = await makeRepo('osq-vcsh-extras-');
    const base = await git(['rev-parse', 'HEAD'], root);
    await git(['branch', 'side', base], root);
    await git(['branch', 'other', base], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'side.txt', 'side\n', 'side one');
    const side = await git(['rev-parse', 'side'], root);
    await git(['checkout', '-q', 'other'], root);
    await commitFile(root, 'other.txt', 'other\n', 'other one');
    const other = await git(['rev-parse', 'other'], root);
    await git(['checkout', '-q', 'main'], root);

    const tree = await git(['rev-parse', 'main^{tree}'], root);
    const before = {
      head: await vcs.head(),
      digest: await vcs.indexDigest(),
      status: await vcs.status(),
    };

    const commit = await vcs.commitTree('main', 'main', 'bridge message', GIT_AUTHOR, [
      side,
      other,
    ]);

    assert.match(commit, /^[0-9a-f]{40}$/);
    assert.equal(await git(['rev-parse', `${commit}^{tree}`], root), tree);
    assert.deepEqual((await git(['rev-list', '--parents', '-n', '1', commit], root)).split(' '), [
      commit,
      base,
      side,
      other,
    ]);
    assert.equal(await git(['rev-parse', 'HEAD'], root), base);
    assert.equal(await git(['rev-parse', 'main'], root), base);
    assert.equal(await vcs.indexDigest(), before.digest);
    assert.deepEqual(await vcs.head(), before.head);
    assert.deepEqual(await vcs.status(), before.status);
  });
});
