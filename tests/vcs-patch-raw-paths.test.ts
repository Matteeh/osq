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

interface PatchResult {
  readonly diff: string;
  readonly applied: string;
}

/**
 * A repository with `core.quotepath` true and one commit, an untracked
 * `a-😀.md`, its patch, and the file that patch creates in a clean clone.
 */
async function patchWithRawPath(parent: string): Promise<PatchResult> {
  const root = path.join(parent, 'repo');
  await fs.mkdir(root);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await git(['config', 'core.quotepath', 'true'], root);
  await fs.writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'base'], root);

  await fs.writeFile(path.join(root, 'a-😀.md'), 'emoji content\n', 'utf8');
  const diff = await new GitVcs(root, DEFAULT_CONFIG).patch();

  const clean = path.join(parent, 'clean');
  await git(['clone', '-q', root, clean], parent);
  const patchFile = path.join(parent, 'change.patch');
  await fs.writeFile(patchFile, diff, 'utf8');
  await git(['apply', patchFile], clean);

  return { diff, applied: await fs.readFile(path.join(clean, 'a-😀.md'), 'utf8') };
}

describe('Vcs patch with raw paths', () => {
  scenario(
    'version-control',
    'Patch with a non-ASCII path',
    { covers: (parent: string) => patchWithRawPath(parent) },
    async ({ run, then }) => {
      const parent = await makeTempDir('osq-vcsp-raw-');
      const result = await run(parent);
      await then(
        'the diff holds the line `diff --git a/a-😀.md b/a-😀.md`, holds no `\\360`, and applying it to a clean copy creates `a-😀.md` with the same content',
        () => {
          assert.ok(result.diff.split('\n').includes('diff --git a/a-😀.md b/a-😀.md'));
          assert.equal(result.diff.includes('\\360'), false);
          assert.equal(result.applied, 'emoji content\n');
        },
      );
    },
  );
});
