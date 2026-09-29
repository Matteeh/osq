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

describe('Vcs commitTree', () => {
  it("commits a branch's tree with the parent, author, and message, writing nothing", async () => {
    const { root, vcs } = await makeRepo('osq-vcsl-tree-');
    const base = await git(['rev-parse', 'HEAD'], root);
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'one.txt', 'one\n', 'side one');
    await commitFile(root, 'two.txt', 'two\n', 'side two');
    const tree = await git(['rev-parse', 'side^{tree}'], root);
    await git(['checkout', '-q', 'main'], root);
    await fs.writeFile(path.join(root, 'seed.txt'), 'modified\n', 'utf8');
    await fs.writeFile(path.join(root, 'staged.txt'), 'staged\n', 'utf8');
    await git(['add', '--', 'staged.txt'], root);
    const before = {
      head: await vcs.head(),
      digest: await vcs.indexDigest(),
      status: await vcs.status(),
    };

    const commit = await vcs.commitTree('side', 'main', 'land message', GIT_AUTHOR);
    assert.match(commit, /^[0-9a-f]{40}$/);
    assert.equal(await git(['rev-parse', `${commit}^{tree}`], root), tree);
    assert.deepEqual((await git(['rev-list', '--parents', '-n', '1', commit], root)).split(' '), [
      commit,
      base,
    ]);
    const format = await git(['show', '-s', '--format=%an <%ae>%n%cn <%ce>%n%B', commit], root);
    assert.match(format, /Osq Author <author@example\.invalid>/);
    assert.match(format, /osq <osq@example\.invalid>/);
    assert.match(format, /land message/);

    assert.equal(await git(['rev-parse', 'HEAD'], root), base);
    assert.equal(await git(['rev-parse', 'main'], root), base);
    assert.equal(await vcs.indexDigest(), before.digest);
    assert.deepEqual(await vcs.head(), before.head);
    assert.deepEqual(await vcs.status(), before.status);
  });

  it('runs no hook', async () => {
    const { root, vcs } = await makeRepo('osq-vcsl-nohook-');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'one.txt', 'one\n', 'side one');
    await git(['checkout', '-q', 'main'], root);
    const dir = path.resolve(root, await git(['rev-parse', '--git-path', 'hooks'], root));
    await fs.writeFile(path.join(dir, 'pre-commit'), '#!/bin/sh\necho blocked\nexit 1\n', 'utf8');
    await fs.chmod(path.join(dir, 'pre-commit'), 0o755);

    const commit = await vcs.commitTree('side', 'main', 'message', GIT_AUTHOR);
    assert.match(commit, /^[0-9a-f]{40}$/);
  });

  it('signs when git is set to, because commit-tree ignores the setting', async () => {
    const { parent, root, vcs } = await makeRepo('osq-vcsl-sign-');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'one.txt', 'one\n', 'side one');
    await git(['checkout', '-q', 'main'], root);
    const record = path.join(parent, 'gpg-called.txt');
    const program = path.join(parent, 'gpg.sh');
    const script = [
      '#!/bin/sh',
      `echo called >> ${JSON.stringify(record)}`,
      'cat >/dev/null',
      "printf '\\n[GNUPG:] SIG_CREATED D 1 8 00 0 X\\n' >&2",
      "printf '%s\\n' '-----BEGIN PGP SIGNATURE-----' '' 'AAAA' '-----END PGP SIGNATURE-----'",
      '',
    ].join('\n');
    await fs.writeFile(program, script, 'utf8');
    await fs.chmod(program, 0o755);
    await git(['config', 'commit.gpgSign', 'true'], root);
    await git(['config', 'gpg.program', program], root);

    const commit = await vcs.commitTree('side', 'main', 'signed', GIT_AUTHOR);
    assert.match(await git(['cat-file', '-p', commit], root), /gpgsig/);
    assert.match(await fs.readFile(record, 'utf8'), /called/);
  });
});

describe('Vcs fastForward', () => {
  it('moves HEAD past a modified, a staged, and an untracked file it does not touch', async () => {
    const { root, vcs } = await makeRepo('osq-vcsl-ff-');
    await commitFile(root, 'a.txt', 'base\n', 'add a');
    await commitFile(root, 's.txt', 'base\n', 'add s');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'b.txt', 'from side\n', 'side b');
    const side = await git(['rev-parse', 'side'], root);
    await git(['checkout', '-q', 'main'], root);
    await fs.writeFile(path.join(root, 'a.txt'), 'modified\n', 'utf8');
    await fs.writeFile(path.join(root, 's.txt'), 'staged\n', 'utf8');
    await git(['add', '--', 's.txt'], root);
    await fs.mkdir(path.join(root, 'drafts'));
    await fs.writeFile(path.join(root, 'drafts', 'x'), 'draft\n', 'utf8');

    const result = await vcs.fastForward(side);
    assert.deepEqual(result, { status: 'done', blocked: [], changed: ['b.txt'] });
    assert.equal(await git(['rev-parse', 'HEAD'], root), side);
    assert.equal(await git(['rev-parse', 'main'], root), side);
    assert.equal(await fs.readFile(path.join(root, 'b.txt'), 'utf8'), 'from side\n');
    assert.equal(await fs.readFile(path.join(root, 'a.txt'), 'utf8'), 'modified\n');
    assert.match(await git(['diff', '--cached', '--name-only'], root), /s\.txt/);
    assert.equal(await fs.readFile(path.join(root, 'drafts', 'x'), 'utf8'), 'draft\n');
  });

  it('blocks an uncommitted file the commit changes and runs no write', async () => {
    const { root, vcs } = await makeRepo('osq-vcsl-blocked-');
    await commitFile(root, 'b.txt', 'base\n', 'add b');
    const base = await git(['rev-parse', 'HEAD'], root);
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'b.txt', 'from side\n', 'side b');
    const side = await git(['rev-parse', 'side'], root);
    await git(['checkout', '-q', 'main'], root);
    await fs.writeFile(path.join(root, 'b.txt'), 'local\n', 'utf8');

    const result = await vcs.fastForward(side);
    assert.deepEqual(result, { status: 'blocked', blocked: ['b.txt'] });
    assert.equal(await git(['rev-parse', 'HEAD'], root), base);
    assert.equal(await fs.readFile(path.join(root, 'b.txt'), 'utf8'), 'local\n');
  });

  it('blocks an uncommitted rename whose old path the commit changes', async () => {
    const { root, vcs } = await makeRepo('osq-vcsl-rename-');
    await commitFile(root, 'old.txt', 'base\n', 'add old');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'old.txt', 'from side\n', 'side old');
    const side = await git(['rev-parse', 'side'], root);
    await git(['checkout', '-q', 'main'], root);
    await git(['mv', 'old.txt', 'new.txt'], root);

    const result = await vcs.fastForward(side);
    assert.deepEqual(result, { status: 'blocked', blocked: ['old.txt'] });
  });

  it('fails with git output when the named commit is not a descendant', async () => {
    const { root, vcs } = await makeRepo('osq-vcsl-nonff-');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'side.txt', 'side\n', 'side one');
    const side = await git(['rev-parse', 'side'], root);
    await git(['checkout', '-q', 'main'], root);
    await commitFile(root, 'main.txt', 'main\n', 'main one');
    const main = await git(['rev-parse', 'HEAD'], root);

    await assert.rejects(() => vcs.fastForward(side));
    assert.equal(await git(['rev-parse', 'HEAD'], root), main);
  });
});

describe('Vcs countCommits', () => {
  it('counts the commits the target adds and answers zero for missing refs', async () => {
    const { root, vcs } = await makeRepo('osq-vcsl-count-');
    await git(['branch', 'side'], root);
    await git(['checkout', '-q', 'side'], root);
    await commitFile(root, 'one.txt', 'one\n', 'side one');
    await commitFile(root, 'two.txt', 'two\n', 'side two');
    await git(['checkout', '-q', 'main'], root);

    assert.equal(await vcs.countCommits('main', 'side'), 2);
    assert.equal(await vcs.countCommits('side', 'main'), 0);
    assert.equal(await vcs.countCommits('side', 'side'), 0);
    assert.equal(await vcs.countCommits('missing', 'main'), 0);
    assert.equal(await vcs.countCommits('main', 'missing'), 0);
  });
});

describe('NoVcs land operations', () => {
  it('counts zero and fails the writes naming the reason', async () => {
    const vcs = new NoVcs('not a git repository');
    assert.equal(await vcs.countCommits('main', 'side'), 0);
    await assert.rejects(
      () => vcs.commitTree('side', 'main', 'message', GIT_AUTHOR),
      /not a git repository/,
    );
    await assert.rejects(() => vcs.fastForward('side'), /not a git repository/);
  });
});
