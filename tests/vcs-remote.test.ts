import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
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

/** Commit one small file on the current branch and return the commit. */
async function commitFile(
  root: string,
  file: string,
  contents: string,
  message: string,
): Promise<string> {
  await fs.writeFile(path.join(root, file), contents, 'utf8');
  await git(['add', '--', file], root);
  await git(['commit', '-qm', message], root);
  return git(['rev-parse', 'HEAD'], root);
}

interface Remote {
  readonly parent: string;
  readonly origin: string;
  readonly upstream: string;
  readonly clone: string;
  readonly vcs: GitVcs;
}

/** `origin`'s `main` commit, read straight from the bare repository. */
async function originMain(remote: Remote): Promise<string> {
  return git(['--git-dir', remote.origin, 'rev-parse', 'main'], remote.parent);
}

/**
 * A bare `origin`, an upstream clone that seeds it, and a second clone under
 * test: the local repository the `GitVcs` reads and writes.
 */
async function makeRemote(prefix: string, config: OsqConfig = DEFAULT_CONFIG): Promise<Remote> {
  const parent = await makeTempDir(prefix);
  const origin = path.join(parent, 'origin.git');
  await git(['init', '-q', '--bare', '-b', 'main', origin], parent);

  const upstream = path.join(parent, 'upstream');
  await fs.mkdir(upstream);
  await git(['init', '-q', '-b', 'main'], upstream);
  await git(['config', 'user.name', 'osq'], upstream);
  await git(['config', 'user.email', 'osq@example.invalid'], upstream);
  await commitFile(upstream, 'seed.txt', 'seed\n', 'init');
  await git(['remote', 'add', 'origin', origin], upstream);
  await git(['push', '-q', 'origin', 'main'], upstream);

  const clone = path.join(parent, 'clone');
  await git(['clone', '-q', origin, clone], parent);
  await git(['config', 'user.name', 'osq'], clone);
  await git(['config', 'user.email', 'osq@example.invalid'], clone);
  return { parent, origin, upstream, clone, vcs: new GitVcs(clone, config) };
}

describe('Vcs fetchBranch', () => {
  it('fetches a branch without moving local branches, the status or the index', async () => {
    const remote = await makeRemote('osq-vcsr-fetch-');
    const ahead = await commitFile(remote.upstream, 'ahead.txt', 'ahead\n', 'ahead');
    await git(['push', '-q', 'origin', 'main'], remote.upstream);
    const before = {
      main: await git(['rev-parse', 'main'], remote.clone),
      status: await remote.vcs.status(),
      digest: await remote.vcs.indexDigest(),
    };

    const fetched = await remote.vcs.fetchBranch('origin', 'main');
    assert.equal(fetched, ahead);
    assert.equal(await git(['rev-parse', 'main'], remote.clone), before.main);
    assert.deepEqual(await remote.vcs.status(), before.status);
    assert.equal(await remote.vcs.indexDigest(), before.digest);
  });

  it('fails with git output when the remote does not exist', async () => {
    const remote = await makeRemote('osq-vcsr-noremote-');
    await git(['remote', 'remove', 'origin'], remote.clone);
    await assert.rejects(() => remote.vcs.fetchBranch('origin', 'main'), /origin/);
  });
});

describe('Vcs pushBranch', () => {
  it('pushes a fast-forward and reports done with git output', async () => {
    const remote = await makeRemote('osq-vcsr-push-');
    const commit = await commitFile(remote.clone, 'work.txt', 'work\n', 'work');

    const result = await remote.vcs.pushBranch('origin', commit, 'main');
    assert.equal(result.status, 'done');
    assert.equal(await originMain(remote), commit);
    assert.ok(result.output.length > 0, 'expected git output on a push result');
  });

  it('reports rejected and leaves the remote alone when it moved', async () => {
    const remote = await makeRemote('osq-vcsr-reject-');
    const moved = await commitFile(remote.upstream, 'moved.txt', 'moved\n', 'moved');
    await git(['push', '-q', 'origin', 'main'], remote.upstream);
    const commit = await commitFile(remote.clone, 'mine.txt', 'mine\n', 'mine');

    const result = await remote.vcs.pushBranch('origin', commit, 'main');
    assert.equal(result.status, 'rejected');
    assert.equal(await originMain(remote), moved);
  });

  it('bounds a push by timeouts.gitRemoteSeconds', async () => {
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      timeouts: { ...DEFAULT_CONFIG.timeouts, gitRemoteSeconds: 0.2 },
    };
    const remote = await makeRemote('osq-vcsr-slow-', config);
    const hooksPath = await git(['rev-parse', '--git-path', 'hooks'], remote.clone);
    const hooks = path.resolve(remote.clone, hooksPath);
    await fs.writeFile(path.join(hooks, 'pre-push'), '#!/bin/sh\nsleep 5\n', 'utf8');
    await fs.chmod(path.join(hooks, 'pre-push'), 0o755);
    const commit = await commitFile(remote.clone, 'slow.txt', 'slow\n', 'slow');

    const started = Date.now();
    await assert.rejects(() => remote.vcs.pushBranch('origin', commit, 'main'));
    assert.ok(Date.now() - started < 4000, 'push was not bounded by the timeout');
  });
});

describe('NoVcs remote operations', () => {
  it('rejects both operations naming the reason git is off', async () => {
    const vcs = new NoVcs('not a git repository');
    await assert.rejects(() => vcs.fetchBranch('origin', 'main'), /not a git repository/);
    await assert.rejects(() => vcs.pushBranch('origin', 'abc', 'main'), /not a git repository/);
  });
});
