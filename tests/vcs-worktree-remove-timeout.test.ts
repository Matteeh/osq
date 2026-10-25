import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'node:test';
import { promisify } from 'node:util';
import { type ScenarioRow, scenario } from '@matteeh/osq/testing';
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A table cell by header name, with or without its markdown code ticks. */
function cell(row: ScenarioRow, name: string): string {
  return row[name] ?? row[`\`${name}\``] ?? '';
}

/** A table cell's seconds, or undefined for `unset`, without its code ticks. */
function seconds(value: string): number | undefined {
  const text = value.replace(/^`|`$/g, '').trim();
  return text === 'unset' ? undefined : Number(text);
}

/** The config row `row` names, with each timeout only when the cell is set. */
function configFor(row: ScenarioRow): OsqConfig {
  const gitSeconds = seconds(cell(row, 'gitSeconds'));
  const gitWorktreeRemoveSeconds = seconds(cell(row, 'gitWorktreeRemoveSeconds'));
  return {
    ...DEFAULT_CONFIG,
    timeouts: {
      ...DEFAULT_CONFIG.timeouts,
      ...(gitSeconds === undefined ? {} : { gitSeconds }),
      ...(gitWorktreeRemoveSeconds === undefined ? {} : { gitWorktreeRemoveSeconds }),
    },
  };
}

interface Worktree {
  readonly repo: string;
  readonly path: string;
  readonly binary: string;
}

/** A repository with one linked worktree and a fake git that sleeps on remove. */
async function makeWorktree(): Promise<Worktree> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-vcs-worktree-remove-'));
  tmpDirs.push(root);
  const repo = path.join(root, 'repo');
  const worktreePath = path.join(root, 'worktree');
  await fs.mkdir(repo);
  await initRepo(repo);
  await git(['worktree', 'add', '-q', '-b', 'linked', worktreePath, 'main'], repo);
  const binary = await writeFakeGit(
    root,
    [
      'if [ "$1" = "--version" ]; then echo "git version 9.9.9"; exit 0; fi',
      'if [ "$1" = "rev-parse" ] && [ "$2" = "--show-toplevel" ]; then pwd; exit 0; fi',
      'if [ "$1" = "worktree" ] && [ "$2" = "remove" ]; then sleep 1; exec git "$@"; fi',
      'exec git "$@"',
    ].join('\n'),
  );
  return { repo, path: worktreePath, binary };
}

/** Whether `target` exists. */
async function exists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

scenario(
  'version-control',
  'Worktree removal under its own limit',
  { covers: (vcs: Vcs, worktreePath: string) => vcs.worktreeRemove(worktreePath) },
  async ({ run, each }) => {
    await each('it does what the row says:', async (row) => {
      const worktree = await makeWorktree();
      const vcs = await selectVcs(worktree.repo, configFor(row), {
        gitBinary: worktree.binary,
      });
      const outcome = await run(vcs, worktree.path).then(
        () => ({ error: undefined }),
        (error: unknown) => ({ error }),
      );
      if (row.Outcome === 'the worktree is removed') {
        assert.equal(outcome.error, undefined, String(outcome.error));
        assert.equal(await exists(worktree.path), false, row.Outcome);
        return;
      }
      assert.ok(outcome.error instanceof Error, String(outcome.error));
      assert.match(
        outcome.error.message,
        new RegExp(`git worktree remove ${escapeRegExp(worktree.path)} timed out after 0\\.1s`),
        row.Outcome,
      );
    });
  },
);
