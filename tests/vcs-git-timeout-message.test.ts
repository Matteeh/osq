import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'node:test';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { selectVcs } from '../src/core/vcs/select.js';
import type { Vcs } from '../src/core/vcs/vcs.js';

const execFileAsync = promisify(execFile);
const GIT_AUTHOR = ['-c', 'user.name=osq', '-c', 'user.email=osq@example.invalid'];

const tmpDirs: string[] = [];

afterEach(async () => {
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

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

/** Create a temporary repository on `main` with one commit. */
async function initRepo(dir: string): Promise<void> {
  await git(['init', '-q', '-b', 'main'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git([...GIT_AUTHOR, 'commit', '-qm', 'init'], dir);
}

/** Write an executable fake git binary and return its path. */
async function writeFakeGit(dir: string, body: string): Promise<string> {
  const file = path.join(dir, 'fake-git.sh');
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await fs.chmod(file, 0o755);
  return file;
}

scenario(
  'version-control',
  'Prune past its time limit',
  { covers: (vcs: Vcs) => vcs.worktreePrune() },
  async ({ run, then }) => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-git-timeout-'));
    tmpDirs.push(dir);
    await initRepo(dir);
    const binary = await writeFakeGit(
      dir,
      [
        'if [ "$1" = "--version" ]; then echo "git version 9.9.9"; exit 0; fi',
        'if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then pwd; exit 0; fi',
        'if [ "$1" = "worktree" ] && [ "$2" = "prune" ]; then exec sleep 5; fi',
        'exec git "$@"',
      ].join('\n'),
    );
    const config: OsqConfig = {
      ...DEFAULT_CONFIG,
      timeouts: { ...DEFAULT_CONFIG.timeouts, gitSeconds: 0.1 },
    };
    const vcs = await selectVcs(dir, config, { gitBinary: binary });
    assert.equal(vcs.kind, 'git');
    const outcome = await run(vcs).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    );
    await then(
      'it fails with an error whose message holds `git worktree prune timed out after 0.1s`',
      () => {
        assert.ok(outcome.error instanceof Error, String(outcome.error));
        assert.match(outcome.error.message, /git worktree prune timed out after 0\.1s/);
      },
    );
  },
);
