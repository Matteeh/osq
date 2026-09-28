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
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
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

describe('Vcs merge operations', () => {
  it('leaves a clean no-commit merge staged with HEAD unchanged', async () => {
    const { root, vcs } = await makeRepo('osq-vcsm-clean-');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'b.txt', 'from side\n', 'side b');
    await git(['checkout', '-q', 'main'], root);
    await commitFile(root, 'a.txt', 'from main\n', 'main a');
    const mainSha = await git(['rev-parse', 'HEAD'], root);
    const sideSha = await git(['rev-parse', 'side'], root);

    const result = await vcs.merge('side', false);
    assert.deepEqual(result, { status: 'clean', conflicts: [] });
    assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'from main\n');
    assert.equal(await fs.readFile(path.join(root, 'b.txt'), 'utf8'), 'from side\n');
    const staged = (await git(['diff', '--cached', '--name-only'], root))
      .split('\n')
      .filter(Boolean);
    assert.ok(staged.includes('b.txt'), 'the side change should be staged');
    assert.equal(await git(['rev-parse', 'HEAD'], root), mainSha);

    const merged = await vcs.commit([], 'merge side', GIT_AUTHOR);
    assert.deepEqual((await git(['rev-list', '--parents', '-n', '1', merged], root)).split(' '), [
      merged,
      mainSha,
      sideSha,
    ]);
  });

  it('reports a conflict and abort restores HEAD and an empty status', async () => {
    const { root, vcs } = await makeRepo('osq-vcsm-conflict-');
    await commitFile(root, 'a.txt', 'base\n', 'add a');
    await git(['branch', 'side'], root);
    await commitFile(root, 'a.txt', 'main\n', 'main a');
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'a.txt', 'side\n', 'side a');
    await git(['checkout', '-q', 'main'], root);
    const mainSha = await git(['rev-parse', 'HEAD'], root);

    const result = await vcs.merge('side', false);
    assert.equal(result.status, 'conflict');
    assert.deepEqual(result.conflicts, ['a.txt']);

    await vcs.mergeAbort();
    assert.equal(await git(['rev-parse', 'HEAD'], root), mainSha);
    assert.equal(await git(['rev-parse', 'main'], root), mainSha);
    assert.deepEqual(await vcs.status(), []);
  });

  it('squashes a branch that contains HEAD into one parentless commit', async () => {
    const { root, vcs } = await makeRepo('osq-vcsm-squash-');
    const base = await git(['rev-parse', 'HEAD'], root);
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 's1.txt', 'one\n', 'side one');
    await commitFile(root, 's2.txt', 'two\n', 'side two');
    const sideTree = await git(['rev-parse', 'side^{tree}'], root);
    await git(['checkout', '-q', 'main'], root);

    const result = await vcs.merge('side', true);
    assert.deepEqual(result, { status: 'clean', conflicts: [] });
    assert.equal(await git(['rev-parse', 'HEAD'], root), base);
    assert.equal(await fs.readFile(path.join(root, 's1.txt'), 'utf8'), 'one\n');
    assert.equal(await fs.readFile(path.join(root, 's2.txt'), 'utf8'), 'two\n');

    const squashed = await vcs.commit([], 'squash side', GIT_AUTHOR);
    assert.deepEqual((await git(['rev-list', '--parents', '-n', '1', squashed], root)).split(' '), [
      squashed,
      base,
    ]);
    assert.equal(await git(['rev-parse', `${squashed}^{tree}`], root), sideTree);
  });

  it('fails when an untracked file is in the way and leaves it and the index alone', async () => {
    const { root, vcs } = await makeRepo('osq-vcsm-untracked-');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'c.txt', 'from side\n', 'side c');
    await git(['checkout', '-q', 'main'], root);
    await fs.writeFile(path.join(root, 'c.txt'), 'untracked\n', 'utf8');
    const beforeDigest = await vcs.indexDigest();

    await assert.rejects(() => vcs.merge('side', true), /c\.txt/);
    assert.equal(await fs.readFile(path.join(root, 'c.txt'), 'utf8'), 'untracked\n');
    assert.equal(await vcs.indexDigest(), beforeDigest);
  });

  it('answers ancestry for ancestors, descendants, itself, and missing refs', async () => {
    const { root, vcs } = await makeRepo('osq-vcsm-ancestor-');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 's.txt', 'side\n', 'side one');
    await git(['checkout', '-q', 'main'], root);

    assert.equal(await vcs.isAncestor('main', 'side'), true);
    assert.equal(await vcs.isAncestor('side', 'main'), false);
    assert.equal(await vcs.isAncestor('main', 'main'), true);
    assert.equal(await vcs.isAncestor('missing', 'main'), false);
  });

  it('stages exactly the given paths, including deletions', async () => {
    const { root, vcs } = await makeRepo('osq-vcsm-stage-');
    await commitFile(root, 'a.txt', 'a\n', 'add a');
    await commitFile(root, 'b.txt', 'b\n', 'add b');
    await fs.rm(path.join(root, 'a.txt'));
    await fs.writeFile(path.join(root, 'b.txt'), 'changed\n', 'utf8');

    await vcs.stage(['a.txt']);
    const staged = (await git(['diff', '--cached', '--name-status'], root))
      .split('\n')
      .filter(Boolean);
    assert.deepEqual(staged, ['D\ta.txt']);
    assert.equal(await git(['diff', '--name-only'], root), 'b.txt');
  });
});

describe('NoVcs merge operations', () => {
  it('answers ancestry false and fails the writes naming the reason', async () => {
    const vcs = new NoVcs('not a git repository');
    assert.equal(await vcs.isAncestor('main', 'main'), false);

    await assert.rejects(() => vcs.merge('main', false), /not a git repository/);
    await assert.rejects(() => vcs.mergeAbort(), /not a git repository/);
    await assert.rejects(() => vcs.stage(['a.txt']), /not a git repository/);
  });
});
