import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { selectVcs } from '../src/core/vcs/select.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIXTURE_DIR = path.join(REPO_ROOT, 'fixture');
const GIT_AUTHOR = ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid'];

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
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'])
    Reflect.deleteProperty(env, key);
  return env;
}

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
  return stdout.trim();
}

/** Create a temporary repository on `main` with one commit and return its HEAD. */
async function initRepo(dir: string): Promise<string> {
  await git(['init', '-q', '-b', 'main'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git([...GIT_AUTHOR, 'commit', '-qm', 'init'], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

async function commitAll(dir: string, message: string): Promise<void> {
  await git(['add', '-A'], dir);
  await git([...GIT_AUTHOR, 'commit', '-qm', message], dir);
}

/** Write an executable fake git binary and return its path. */
async function writeFakeGit(dir: string, body: string): Promise<string> {
  const file = path.join(dir, 'fake-git.sh');
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await fs.chmod(file, 0o755);
  return file;
}

describe('Vcs selection', () => {
  it('returns NoVcs for a plain folder outside any repository', async () => {
    const dir = await makeTempDir('osq-vcs-plain-');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.equal(vcs.kind, 'none');
    assert.equal(vcs.unavailableReason, 'not a git repository');
  });

  it('returns NoVcs for a folder below the repository root', async () => {
    const vcs = await selectVcs(FIXTURE_DIR, DEFAULT_CONFIG);
    assert.equal(vcs.kind, 'none');
    assert.equal(vcs.unavailableReason, 'not the repository root');
  });

  it('returns NoVcs when the git binary cannot be found', async () => {
    const dir = await makeTempDir('osq-vcs-nobinary-');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG, {
      gitBinary: 'osq-definitely-not-a-real-binary',
    });
    assert.equal(vcs.kind, 'none');
    assert.equal(vcs.unavailableReason, 'git not found');
  });

  it('selects GitVcs at the top level of a temporary repository', async () => {
    const dir = await makeTempDir('osq-vcs-repo-');
    await initRepo(dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.equal(vcs.kind, 'git');
    assert.equal(vcs.unavailableReason, null);
  });
});

describe('Vcs port', () => {
  it('NoVcs answers every read with empty values and carries the reason', async () => {
    const dir = await makeTempDir('osq-vcs-empty-');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.equal(await vcs.root(), null);
    assert.deepEqual(await vcs.head(), { sha: null, branch: null });
    assert.equal(await vcs.indexDigest(), '');
    assert.deepEqual(await vcs.stashList(), []);
    assert.deepEqual(await vcs.status(), []);
  });

  it('reads the repository root', async () => {
    const dir = await makeTempDir('osq-vcs-root-');
    await initRepo(dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.equal(await vcs.root(), await fs.realpath(dir));
  });

  it('reports HEAD commit and branch on a branch', async () => {
    const dir = await makeTempDir('osq-vcs-branch-');
    const sha = await initRepo(dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.deepEqual(await vcs.head(), { sha, branch: 'main' });
  });

  it('reports a null commit in a repository with no commit', async () => {
    const dir = await makeTempDir('osq-vcs-unborn-');
    await git(['init', '-q', '-b', 'main'], dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.deepEqual(await vcs.head(), { sha: null, branch: 'main' });
  });

  it('reports a null branch when HEAD is detached', async () => {
    const dir = await makeTempDir('osq-vcs-detached-');
    const sha = await initRepo(dir);
    await git(['checkout', '-q', sha], dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    assert.deepEqual(await vcs.head(), { sha, branch: null });
  });

  it('lists a stash made with -m and the branch it was made on', async () => {
    const dir = await makeTempDir('osq-vcs-stash-');
    await initRepo(dir);
    await fs.writeFile(path.join(dir, 'seed.txt'), 'changed\n', 'utf8');
    await git(['stash', 'push', '-m', 'work in progress'], dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    const stashes = await vcs.stashList();
    assert.equal(stashes.length, 1);
    assert.match(stashes[0]?.sha ?? '', /^[0-9a-f]{40}$/);
    assert.equal(stashes[0]?.branch, 'main');
  });

  it('lists an untracked file in a new folder and leaves ignored files out', async () => {
    const dir = await makeTempDir('osq-vcs-status-');
    await initRepo(dir);
    await fs.writeFile(path.join(dir, '.gitignore'), 'ignored.txt\n', 'utf8');
    await commitAll(dir, 'ignore');
    await fs.writeFile(path.join(dir, 'ignored.txt'), 'x\n', 'utf8');
    await fs.mkdir(path.join(dir, 'a'));
    await fs.writeFile(path.join(dir, 'a', 'b.txt'), 'b\n', 'utf8');
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    const paths = (await vcs.status()).map((entry) => entry.path);
    assert.ok(paths.includes('a/b.txt'), `expected a/b.txt in ${paths.join(', ')}`);
    assert.ok(!paths.includes('ignored.txt'));
  });

  it('reports a renamed file with its old path', async () => {
    const dir = await makeTempDir('osq-vcs-rename-');
    await initRepo(dir);
    await fs.writeFile(path.join(dir, 'old.txt'), 'content\n', 'utf8');
    await commitAll(dir, 'add old');
    await git(['mv', 'old.txt', 'new.txt'], dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    const renamed = (await vcs.status()).find((entry) => entry.path === 'new.txt');
    assert.ok(renamed, 'expected the rename destination in status');
    assert.equal(renamed.code, 'R ');
    assert.equal(renamed.from, 'old.txt');
  });

  it('changes the index digest when a file is staged', async () => {
    const dir = await makeTempDir('osq-vcs-index-');
    await initRepo(dir);
    const vcs = await selectVcs(dir, DEFAULT_CONFIG);
    const before = await vcs.indexDigest();
    await fs.writeFile(path.join(dir, 'staged.txt'), 'staged\n', 'utf8');
    await git(['add', 'staged.txt'], dir);
    const after = await vcs.indexDigest();
    assert.notEqual(after, before);
  });

  it('ignores GIT_DIR set in the environment', async () => {
    const repoA = await makeTempDir('osq-vcs-env-a-');
    const repoB = await makeTempDir('osq-vcs-env-b-');
    const shaA = await initRepo(repoA);
    await initRepo(repoB);
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = path.join(repoB, '.git');
    try {
      const vcs = await selectVcs(repoA, DEFAULT_CONFIG);
      assert.equal(vcs.kind, 'git');
      assert.equal(await vcs.root(), await fs.realpath(repoA));
      assert.equal((await vcs.head()).sha, shaA);
    } finally {
      if (saved === undefined) {
        Reflect.deleteProperty(process.env, 'GIT_DIR');
      } else {
        process.env.GIT_DIR = saved;
      }
    }
  });
});

describe('Vcs git read timeout', () => {
  it('bounds each read by timeouts.gitSeconds', async () => {
    const dir = await makeTempDir('osq-vcs-timeout-');
    await initRepo(dir);
    const binary = await writeFakeGit(
      dir,
      [
        'if [ "$1" = "--version" ]; then echo "git version 9.9.9"; exit 0; fi',
        'if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then pwd; exit 0; fi',
        'sleep 5; exit 0',
      ].join('\n'),
    );
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      timeouts: { ...DEFAULT_CONFIG.timeouts, gitSeconds: 0.1 },
    };
    const vcs = await selectVcs(dir, config, { gitBinary: binary });
    assert.equal(vcs.kind, 'git');
    const started = Date.now();
    const head = await vcs.head();
    const elapsed = Date.now() - started;
    assert.deepEqual(head, { sha: null, branch: null });
    assert.ok(elapsed < 2000, `bounded read took ${elapsed}ms`);
  });

  it('uses a ten second default when timeouts.gitSeconds is unset', async () => {
    const dir = await makeTempDir('osq-vcs-default-');
    await initRepo(dir);
    const binary = await writeFakeGit(
      dir,
      [
        'if [ "$1" = "--version" ]; then echo "git version 9.9.9"; exit 0; fi',
        'if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then pwd; exit 0; fi',
        'sleep 0.2; echo "abc123"; exit 0',
      ].join('\n'),
    );
    const vcs = await selectVcs(dir, DEFAULT_CONFIG, { gitBinary: binary });
    assert.equal((await vcs.head()).sha, 'abc123');
  });
});
