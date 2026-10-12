import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { defineConfig } from '../src/core/foundation/config.js';
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

/** The test's own git calls strip the redirecting variables, like osq's reads. */
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

describe('Vcs optional locks', () => {
  it('status leaves the index alone', async () => {
    const root = await makeTempDir('osq-optional-locks-');
    await git(['init', '-q', '-b', 'main'], root);
    await git(['config', 'user.name', 'osq'], root);
    await git(['config', 'user.email', 'osq@example.invalid'], root);
    await fs.writeFile(path.join(root, 'a.txt'), 'one\n', 'utf8');
    await git(['add', '-A'], root);
    await git(['commit', '-qm', 'init'], root);

    // Move `a.txt`'s modification time one minute ahead with the content
    // unchanged, so the stat cache in the index is stale.
    const stat = await fs.stat(path.join(root, 'a.txt'));
    const ahead = new Date(stat.mtimeMs + 60_000);
    await fs.utimes(path.join(root, 'a.txt'), ahead, ahead);

    const indexPath = path.join(root, await git(['rev-parse', '--git-path', 'index'], root));
    const before = await fs.readFile(indexPath);

    const config = defineConfig({
      vcs: { enabled: true, author: 'Osq <osq@example.invalid>' },
    });
    const vcs = await selectVcs(root, config);
    assert.equal(vcs.kind, 'git');
    assert.deepEqual(await vcs.status(), []);

    const after = await fs.readFile(indexPath);
    assert.deepEqual(after, before);

    // Plain `git status` refreshes the stale stat cache and rewrites the index,
    // so this test fails without GIT_OPTIONAL_LOCKS=0 on osq's own reads.
    await git(['status'], root);
    const rewritten = await fs.readFile(indexPath);
    assert.notDeepEqual(rewritten, before);
  });
});
