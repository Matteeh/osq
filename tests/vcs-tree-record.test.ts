import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { type ScenarioRow, scenario } from '@matteeh/osq/testing';
import { DEFAULT_CONFIG, type OsqConfig } from '../src/core/foundation/config.js';
import { GitVcs } from '../src/core/vcs/git-vcs.js';
import { selectVcs } from '../src/core/vcs/select.js';
import { resolveTreeRecordPath, treeRecordPath } from '../src/core/vcs/tree-record.js';

const execFileAsync = promisify(execFile);
const AUTHOR = 'Osq Author <author@example.invalid>';

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

/** Create a temporary repository with a local identity and one commit. */
async function initRepo(dir: string): Promise<string> {
  await git(['init', '-q', '-b', 'main'], dir);
  await git(['config', 'user.name', 'osq'], dir);
  await git(['config', 'user.email', 'osq@example.invalid'], dir);
  await fs.writeFile(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  await git(['add', '-A'], dir);
  await git(['commit', '-qm', 'init'], dir);
  return git(['rev-parse', 'HEAD'], dir);
}

/** Write an executable hook into a repository's hooks directory. */
async function writeHook(root: string, name: string, body: string): Promise<void> {
  const dir = path.resolve(root, await git(['rev-parse', '--git-path', 'hooks'], root));
  const file = path.join(dir, name);
  await fs.writeFile(file, `#!/bin/sh\n${body}\n`, 'utf8');
  await fs.chmod(file, 0o755);
}

/** A fresh checkout repository rooted at a temporary parent. */
async function makeCheckout(prefix: string): Promise<string> {
  const parent = await makeTempDir(prefix);
  const checkout = path.join(parent, 'repo');
  await fs.mkdir(checkout);
  await initRepo(checkout);
  return checkout;
}

function enabledConfig(): OsqConfig {
  return { ...DEFAULT_CONFIG, vcs: { enabled: true, author: AUTHOR } };
}

async function readLines(file: string): Promise<string[]> {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return text.split('\n').filter((line) => line.length > 0);
}

async function exists(file: string): Promise<boolean> {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false);
}

async function worktreeAddFromCheckout(checkout: string, worktree: string): Promise<string[]> {
  const vcs = await selectVcs(checkout, enabledConfig());
  await vcs.createBranch('osq/001-a', 'main');
  await vcs.worktreeAdd(worktree, 'osq/001-a');
  return readLines(path.join(checkout, '.git', 'osq-trees.jsonl'));
}

interface CommitResult {
  readonly lines: string[];
  readonly worktree: string;
  readonly ownRecord: boolean;
}

async function commitInLinkedWorktree(parent: string): Promise<CommitResult> {
  const checkout = path.join(parent, 'repo');
  await fs.mkdir(checkout);
  await initRepo(checkout);
  const worktree = path.join(parent, 'wt');
  const setup = new GitVcs(checkout, DEFAULT_CONFIG);
  await setup.createBranch('osq/001-a', 'main');
  await setup.worktreeAdd(worktree, 'osq/001-a');

  const vcs = await selectVcs(worktree, enabledConfig());
  await fs.writeFile(path.join(worktree, 'file.txt'), 'x\n', 'utf8');
  await vcs.commit(['file.txt'], 'message', AUTHOR);

  return {
    lines: await readLines(path.join(checkout, '.git', 'osq-trees.jsonl')),
    worktree,
    ownRecord: await exists(path.join(worktree, '.git', 'osq-trees.jsonl')),
  };
}

async function failedCommitRecordsNothing(root: string): Promise<string[]> {
  const vcs = await selectVcs(root, enabledConfig());
  await writeHook(root, 'pre-commit', 'echo "blocked by hook"\nexit 1');
  await fs.writeFile(path.join(root, 'file.txt'), 'x\n', 'utf8');
  await vcs.commit(['file.txt'], 'message', AUTHOR).catch(() => undefined);
  return readLines(path.join(root, '.git', 'osq-trees.jsonl'));
}

async function unwritableRecord(root: string): Promise<{ commit: string; head: string }> {
  await fs.mkdir(path.join(root, '.git', 'osq-trees.jsonl'));
  const vcs = await selectVcs(root, enabledConfig());
  await fs.writeFile(path.join(root, 'file.txt'), 'x\n', 'utf8');
  const commit = await vcs.commit(['file.txt'], 'message', AUTHOR);
  return { commit, head: await git(['rev-parse', 'HEAD'], root) };
}

describe('Tree record', () => {
  scenario(
    'version-control',
    'Worktree add from the checkout',
    { covers: (checkout: string, worktree: string) => worktreeAddFromCheckout(checkout, worktree) },
    async ({ run, then }) => {
      const parent = await makeTempDir('osq-tree-record-add-');
      const checkout = path.join(parent, 'repo');
      await fs.mkdir(checkout);
      await initRepo(checkout);
      const lines = await run(checkout, path.join(parent, 'wt'));
      await then(
        '`.git/osq-trees.jsonl` holds one line whose `op` is `worktree-add` and whose `root` is the checkout',
        () => {
          assert.equal(lines.length, 1);
          const parsed = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
          assert.deepEqual(Object.keys(parsed), ['at', 'op', 'root']);
          assert.equal(parsed.op, 'worktree-add');
          assert.equal(parsed.root, checkout);
        },
      );
    },
  );

  scenario(
    'version-control',
    'Commit in a linked worktree',
    { covers: (parent: string) => commitInLinkedWorktree(parent) },
    async ({ run, then }) => {
      const parent = await makeTempDir('osq-tree-record-commit-');
      const result = await run(parent);
      await then(
        "the checkout's `.git/osq-trees.jsonl` gains one line whose `op` is `commit` and whose `root` is the worktree, and the worktree holds no `osq-trees.jsonl`",
        () => {
          assert.equal(result.lines.length, 1);
          const parsed = JSON.parse(result.lines[0] ?? '{}') as Record<string, unknown>;
          assert.equal(parsed.op, 'commit');
          assert.equal(parsed.root, result.worktree);
          assert.equal(result.ownRecord, false);
        },
      );
    },
  );

  scenario(
    'version-control',
    'Failed commit records nothing',
    { covers: (root: string) => failedCommitRecordsNothing(root) },
    async ({ run, then }) => {
      const root = await makeCheckout('osq-tree-record-fail-');
      const lines = await run(root);
      await then('`.git/osq-trees.jsonl` gains no line', () => {
        assert.deepEqual(lines, []);
      });
    },
  );

  scenario(
    'version-control',
    'Unwritable record',
    { covers: (root: string) => unwritableRecord(root) },
    async ({ run, then }) => {
      const root = await makeCheckout('osq-tree-record-dir-');
      const result = await run(root);
      await then('`commit` returns the new commit and HEAD is that commit', () => {
        assert.match(result.commit, /^[0-9a-f]{40}$/);
        assert.equal(result.commit, result.head);
      });
    },
  );

  scenario(
    'version-control',
    'Record path',
    {
      covers: (root: string, config: OsqConfig, binary?: string) =>
        binary === undefined
          ? treeRecordPath(root, config)
          : resolveTreeRecordPath(root, config, binary),
    },
    async ({ run, each }) => {
      const parent = await makeTempDir('osq-tree-record-path-');
      const checkout = path.join(parent, 'repo');
      await fs.mkdir(checkout);
      await initRepo(checkout);
      const worktree = path.join(parent, 'wt');
      const setup = new GitVcs(checkout, DEFAULT_CONFIG);
      await setup.createBranch('osq/001-a', 'main');
      await setup.worktreeAdd(worktree, 'osq/001-a');
      const outside = await makeTempDir('osq-tree-record-outside-');

      const enabled = enabledConfig();
      const results: Record<string, string | null> = {
        "a temporary repository's checkout": await run(checkout, enabled),
        'a linked worktree of that repository': await run(worktree, enabled),
        'that checkout': await run(checkout, DEFAULT_CONFIG),
        'a temporary folder outside any repository': await run(outside, enabled),
      };
      const expected = (row: ScenarioRow): string | null =>
        row.result === 'null' ? null : path.join(checkout, '.git', 'osq-trees.jsonl');

      await each('it returns the path in the table', (row) => {
        assert.equal(results[row.project], expected(row), `project ${row.project}`);
      });
    },
  );

  it('runs no git when vcs.enabled is not true', async () => {
    const parent = await makeTempDir('osq-tree-record-guard-');
    const sentinel = path.join(parent, 'ran');
    const binary = path.join(parent, 'fake-git.sh');
    await fs.writeFile(binary, `#!/bin/sh\ntouch ${sentinel}\nexit 0\n`, 'utf8');
    await fs.chmod(binary, 0o755);

    const record = await resolveTreeRecordPath(parent, DEFAULT_CONFIG, binary);
    assert.equal(record, null);
    assert.equal(await exists(sentinel), false);
  });
});
