import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe } from 'node:test';
import { promisify } from 'node:util';
import { scenario } from '@matteeh/osq/testing';
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

/** A repository that sets `core.autocrlf` false and stages only the four files. */
async function makeRepo(): Promise<GitVcs> {
  const dir = await makeTempDir('osq-line-endings-');
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'core.autocrlf', 'false'], dir);
  await fs.writeFile(path.join(dir, 'bin.dat'), Buffer.from([0x00, 0x01, 0x0d, 0x0a]));
  await fs.writeFile(path.join(dir, 'lf.txt'), 'ok\n', 'utf8');
  await fs.writeFile(path.join(dir, 'mix.txt'), 'a\nb\r\n', 'utf8');
  await fs.writeFile(path.join(dir, 'win.txt'), 'a\r\nb\r\n', 'utf8');
  await git(['add', '-A'], dir);
  return new GitVcs(dir, DEFAULT_CONFIG);
}

/** A scenario table cell without its markdown code ticks. */
function bare(cell: string): string {
  return cell.replace(/^`|`$/g, '');
}

describe('Vcs lineEndings', () => {
  scenario(
    'version-control',
    'Index line endings of a temporary repository',
    { covers: (vcs: GitVcs) => vcs.lineEndings() },
    async ({ run, each }) => {
      const vcs = await makeRepo();
      const entries = await run(vcs);
      let position = 0;
      await each('`lineEndings()` returns exactly these entries, in this order:', (row) => {
        const entry = entries[position];
        assert.ok(entry, `no entry at position ${position}`);
        assert.equal(entry.path, bare(row.File));
        assert.equal(entry.index, bare(row.Index));
        position += 1;
      });
      assert.equal(position, entries.length);
    },
  );

  scenario(
    'version-control',
    'Line endings without git',
    { covers: (vcs: NoVcs) => vcs.lineEndings() },
    async ({ run, then }) => {
      const vcs = new NoVcs('not a git repository');
      const entries = await run(vcs);
      await then('it returns an empty list', () => {
        assert.deepEqual(entries, []);
      });
    },
  );
});
