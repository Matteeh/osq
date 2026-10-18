import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { DEFAULT_CONFIG } from '../src/core/foundation/config.js';
import { runVerificationCommand } from '../src/core/run/verification.js';
import { GitVcs } from '../src/core/vcs/git-vcs.js';

/**
 * watcher-and-harness "Verify gets the change's diff" and "No diff without a
 * base". The `scenario()` helper cannot look up watcher-and-harness scenarios,
 * so these are plain `node:test`, with temporary git repositories built as
 * `tests/vcs-diff-stat.test.ts` builds them.
 */

const execFileAsync = promisify(execFile);
const TIMEOUT = 30;
const STALE = '/stale.diff';

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

/** Set probe variables on `process.env` for one test and restore them after. */
async function withEnv(
  vars: Readonly<Record<string, string>>,
  run: () => Promise<void>,
): Promise<void> {
  const saved = new Map<string, string | undefined>();
  for (const name of Object.keys(vars)) saved.set(name, process.env[name]);
  for (const [name, value] of Object.entries(vars)) process.env[name] = value;
  try {
    await run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else process.env[name] = value;
    }
  }
}

/** Print `OSQ_DIFF`, then the diff file it names. */
const PRINT_DIFF = `node -e 'process.stdout.write(process.env.OSQ_DIFF + "\\n" + require("fs").readFileSync(process.env.OSQ_DIFF, "utf8"))'`;

/** Print `OSQ_DIFF`, or `<unset>` when the child has no such variable. */
const PRINT_SET = `node -e 'process.stdout.write(process.env.OSQ_DIFF === undefined ? "<unset>" : process.env.OSQ_DIFF)'`;

/** A git repository with one commit and a `src/a.rs`, and its base commit. */
async function makeRepo(prefix: string): Promise<{ root: string; base: string }> {
  const root = await makeTempDir(prefix);
  await git(['init', '-q', '-b', 'main'], root);
  await git(['config', 'user.name', 'osq'], root);
  await git(['config', 'user.email', 'osq@example.invalid'], root);
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'a.rs'), 'one\n', 'utf8');
  await git(['add', '-A'], root);
  await git(['commit', '-qm', 'init'], root);
  return { root, base: await git(['rev-parse', 'HEAD'], root) };
}

/** Write a change folder's `.run/base` marker. */
async function writeBase(root: string, folder: string, base: string): Promise<string> {
  const changeFolder = path.join(root, 'openspec', 'changes', folder);
  await fs.mkdir(path.join(changeFolder, '.run'), { recursive: true });
  await fs.writeFile(path.join(changeFolder, '.run', 'base'), base, 'utf8');
  return changeFolder;
}

describe("watcher-and-harness: Verify gets the change's diff", () => {
  it('writes vcs.patch(base) to a temporary file OSQ_DIFF names, then removes it', async () => {
    const { root, base } = await makeRepo('osq-verify-diff-repo-');
    const changeFolder = await writeBase(root, '001-demo', `${base}\n`);
    await fs.writeFile(path.join(root, 'src', 'a.rs'), 'changed\n', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'b.rs'), 'new\n', 'utf8');

    const result = await runVerificationCommand(root, PRINT_DIFF, TIMEOUT, changeFolder, {
      config: DEFAULT_CONFIG,
    });
    assert.equal(result.exitCode, 0, result.output);

    const newline = result.output.indexOf('\n');
    const diffPath = result.output.slice(0, newline);
    const printed = result.output.slice(newline + 1);

    const vcs = new GitVcs(root, DEFAULT_CONFIG);
    assert.equal(printed, await vcs.patch(base));
    assert.match(printed, /src\/a\.rs/);
    assert.match(printed, /src\/b\.rs/);
    await assert.rejects(fs.access(diffPath));
  });
});

describe('watcher-and-harness: No diff without a base', () => {
  it('removes OSQ_DIFF for a null change folder', async () => {
    const root = await makeTempDir('osq-verify-diff-null-');
    await withEnv({ OSQ_DIFF: STALE }, async () => {
      const result = await runVerificationCommand(root, PRINT_SET, TIMEOUT, null, {
        config: DEFAULT_CONFIG,
      });
      assert.equal(result.output.trim(), '<unset>');
    });
  });

  it('removes OSQ_DIFF for a change folder with no .run/base', async () => {
    const root = await makeTempDir('osq-verify-diff-nomarker-');
    const changeFolder = path.join(root, 'openspec', 'changes', '001-demo');
    await fs.mkdir(changeFolder, { recursive: true });
    await withEnv({ OSQ_DIFF: STALE }, async () => {
      const result = await runVerificationCommand(root, PRINT_SET, TIMEOUT, changeFolder, {
        config: DEFAULT_CONFIG,
      });
      assert.equal(result.output.trim(), '<unset>');
    });
  });

  it('removes OSQ_DIFF for an empty .run/base', async () => {
    const root = await makeTempDir('osq-verify-diff-empty-');
    const changeFolder = await writeBase(root, '001-demo', '  \n');
    await withEnv({ OSQ_DIFF: STALE }, async () => {
      const result = await runVerificationCommand(root, PRINT_SET, TIMEOUT, changeFolder, {
        config: DEFAULT_CONFIG,
      });
      assert.equal(result.output.trim(), '<unset>');
    });
  });

  it('removes OSQ_DIFF when the project root is not a git repository', async () => {
    const root = await makeTempDir('osq-verify-diff-nogit-');
    const changeFolder = await writeBase(root, '001-demo', 'deadbeef\n');
    await withEnv({ OSQ_DIFF: STALE }, async () => {
      const result = await runVerificationCommand(root, PRINT_SET, TIMEOUT, changeFolder, {
        config: DEFAULT_CONFIG,
      });
      assert.equal(result.output.trim(), '<unset>');
    });
  });
});
