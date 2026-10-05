import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { GitVcs } from '../src/core/vcs/git-vcs.js';

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) await fs.rm(dir, { recursive: true, force: true });
});

/** A child environment that cannot redirect git away from `cwd`. */
function cleanGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE']) delete env[key];
  return env;
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: cleanGitEnv() });
}

/** A temporary repository with a local identity and one commit. */
async function makeRepo(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-git-buffer-'));
  tempDirs.push(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  return root;
}

describe('git output larger than 1 MiB', () => {
  it('patches a tree whose diff exceeds the execFile default buffer', async () => {
    const root = await makeRepo();
    const line = `${JSON.stringify({ type: 'verify_ran', output: 'x'.repeat(200) })}\n`;
    await fs.writeFile(path.join(root, 'change.jsonl'), line.repeat(15_000), 'utf8');

    const patch = await new GitVcs(root, DEFAULT_CONFIG).patch();

    assert.ok(patch.length > 3 * 1024 * 1024, `patch is only ${patch.length} bytes`);
    assert.match(patch, /change\.jsonl/);
  });
});
