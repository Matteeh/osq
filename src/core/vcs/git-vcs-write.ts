import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GitResult } from './git-vcs.js';
import type { VcsWorktree } from './vcs.js';

/** The narrow view of `GitVcs` the write helpers run through. */
export interface GitWriteContext {
  /** The repository top level, also the child process's working directory. */
  readonly projectRoot: string;
  /** Run a read or a non-commit write, bounded by `timeouts.gitSeconds`. */
  run(args: string[], env?: NodeJS.ProcessEnv): Promise<GitResult>;
  /** Run a commit, bounded by `timeouts.gitCommitSeconds`. */
  runCommit(args: string[], env?: NodeJS.ProcessEnv): Promise<GitResult>;
}

/** Git's combined output, stdout first, as one error message. */
function combined(result: GitResult): string {
  return [result.stdout, result.stderr].filter((part) => part.length > 0).join('');
}

/** Git's stdout, or throw an `Error` holding its combined output. */
function ok(result: GitResult): string {
  if (result.code !== 0) throw new Error(combined(result));
  return result.stdout;
}

/** Non-empty, trimmed lines of a line-oriented git output. */
function lines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** One git config value, or null when the key is unset or git fails. */
export async function configValue(ctx: GitWriteContext, key: string): Promise<string | null> {
  const result = await ctx.run(['config', '--get', key]);
  if (result.code !== 0) return null;
  const value = result.stdout.trim();
  return value.length > 0 ? value : null;
}

/**
 * The executable, non-`.sample` files in the directory `git rev-parse
 * --git-path hooks` names, which follows `core.hooksPath`.
 */
export async function hookNames(ctx: GitWriteContext): Promise<string[]> {
  const result = await ctx.run(['rev-parse', '--git-path', 'hooks']);
  if (result.code !== 0) return [];
  const dir = path.resolve(ctx.projectRoot, result.stdout.trim());
  const entries = await fs.readdir(dir).catch(() => []);
  const names: string[] = [];
  for (const name of entries) {
    if (name.endsWith('.sample')) continue;
    const stat = await fs.stat(path.join(dir, name)).catch(() => null);
    if (stat?.isFile() && (stat.mode & 0o111) !== 0) names.push(name);
  }
  return names.sort();
}

/** Every branch whose short name starts with `prefix`, sorted by name. */
export async function listBranches(ctx: GitWriteContext, prefix: string): Promise<string[]> {
  const result = await ctx.run(['branch', '--list', '--format=%(refname:short)', `${prefix}*`]);
  if (result.code !== 0) return [];
  return lines(result.stdout);
}

/**
 * The default branch: the branch `refs/remotes/origin/HEAD` names without its
 * `origin/` prefix, read locally, else `fallback`. Never contacts the remote.
 */
export async function defaultBranch(ctx: GitWriteContext, fallback: string): Promise<string> {
  const result = await ctx.run(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  const value = result.code === 0 ? result.stdout.trim() : '';
  if (value.startsWith('origin/') && value.length > 'origin/'.length) {
    return value.slice('origin/'.length);
  }
  return fallback;
}

function parseWorktrees(output: string): VcsWorktree[] {
  const trees: VcsWorktree[] = [];
  let current: { path?: string; branch: string | null; head: string | null } | null = null;
  const flush = (): void => {
    if (current?.path !== undefined) {
      trees.push({ path: current.path, branch: current.branch, head: current.head });
    }
    current = null;
  };
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (line === '') {
      flush();
    } else if (line.startsWith('worktree ')) {
      flush();
      current = { path: line.slice('worktree '.length), branch: null, head: null };
    } else if (current !== null && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length);
    } else if (current !== null && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    }
  }
  flush();
  return trees;
}

/** Every worktree with its path, branch, and HEAD. */
export async function worktreeList(ctx: GitWriteContext): Promise<VcsWorktree[]> {
  const result = await ctx.run(['worktree', 'list', '--porcelain']);
  if (result.code !== 0) return [];
  return parseWorktrees(result.stdout);
}

/** Create `name` at `base`; git fails when the branch already exists. */
export async function createBranch(
  ctx: GitWriteContext,
  name: string,
  base: string,
): Promise<void> {
  ok(await ctx.run(['branch', name, base]));
}

/** Add a worktree for an existing branch. */
export async function worktreeAdd(
  ctx: GitWriteContext,
  worktreePath: string,
  branch: string,
): Promise<void> {
  ok(await ctx.run(['worktree', 'add', worktreePath, branch]));
}

/** Remove a worktree; git refuses one with changes outside ignored files. */
export async function worktreeRemove(ctx: GitWriteContext, worktreePath: string): Promise<void> {
  ok(await ctx.run(['worktree', 'remove', worktreePath]));
}

/** Write the commit message to a temporary file git reads, never an argument. */
async function commitMessage(
  ctx: GitWriteContext,
  author: string,
  message: string,
  paths: readonly string[],
): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-commit-'));
  const file = path.join(dir, 'message.txt');
  try {
    await fs.writeFile(file, message, 'utf8');
    const args = ['commit', `--author=${author}`, '-F', file];
    if (paths.length > 0) args.push('--only', '--', ...paths);
    ok(await ctx.runCommit(args));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Stage exactly `paths` and commit only them, leaving anything else staged as
 * it was; with no paths commit the index as it stands.
 */
export async function commit(
  ctx: GitWriteContext,
  paths: readonly string[],
  message: string,
  author: string,
): Promise<string> {
  if (paths.length > 0) ok(await ctx.run(['add', '--', ...paths]));
  await commitMessage(ctx, author, message, paths);
  return ok(await ctx.run(['rev-parse', '--verify', 'HEAD'])).trim();
}

/** A binary diff against HEAD through a copy of the index, leaving it unchanged. */
export async function patch(ctx: GitWriteContext): Promise<string> {
  const indexPath = await ctx.run(['rev-parse', '--git-path', 'index']);
  const realIndex = path.resolve(ctx.projectRoot, indexPath.stdout.trim());
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-patch-'));
  const tempIndex = path.join(dir, 'index');
  try {
    await fs.copyFile(realIndex, tempIndex).catch(() => undefined);
    const env = { GIT_INDEX_FILE: tempIndex };
    ok(await ctx.run(['add', '-A'], env));
    return ok(await ctx.run(['diff', '--cached', '--binary', 'HEAD'], env));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function assertLinkedWorktree(gitDir: string, commonDir: string, root: string): void {
  const dir = path.resolve(root, gitDir.trim());
  const common = path.resolve(root, commonDir.trim());
  if (dir === common) throw new Error('discard requires a linked worktree');
}

function assertOsqBranch(branch: string, code: number): void {
  if (code !== 0 || !branch.trim().startsWith('osq/')) {
    throw new Error('discard requires HEAD on a branch starting "osq/"');
  }
}

/** Assert the linked-worktree and `osq/` branch preconditions. */
async function assertDiscardable(ctx: GitWriteContext): Promise<void> {
  const [gitDir, commonDir, branch] = await Promise.all([
    ctx.run(['rev-parse', '--git-dir']),
    ctx.run(['rev-parse', '--git-common-dir']),
    ctx.run(['symbolic-ref', '--quiet', '--short', 'HEAD']),
  ]);
  assertLinkedWorktree(gitDir.stdout, commonDir.stdout, ctx.projectRoot);
  assertOsqBranch(branch.stdout, branch.code);
}

/** Files HEAD tracks under `paths`. */
async function headPaths(ctx: GitWriteContext, paths: readonly string[]): Promise<string[]> {
  const result = await ctx.run(['ls-tree', '-r', '--name-only', 'HEAD', '--', ...paths]);
  if (result.code !== 0) return [];
  return lines(result.stdout);
}

/** Files in the index under `paths`. */
async function indexPaths(ctx: GitWriteContext, paths: readonly string[]): Promise<string[]> {
  const result = await ctx.run(['ls-files', '-z', '--', ...paths]);
  if (result.code !== 0) return [];
  return result.stdout.split('\0').filter((entry) => entry.length > 0);
}

/**
 * Restore `paths` to HEAD in the index and the tree, remove files under them
 * HEAD lacks, staged or untracked, and never remove ignored ones. With no
 * paths it returns before running git.
 */
export async function discard(ctx: GitWriteContext, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await assertDiscardable(ctx);
  const head = await headPaths(ctx, paths);
  const inHead = new Set(head);
  const absent = (await indexPaths(ctx, paths)).filter((entry) => !inHead.has(entry));
  if (absent.length > 0) ok(await ctx.run(['rm', '--cached', '-q', '--', ...absent]));
  if (head.length > 0) {
    ok(await ctx.run(['restore', '--source=HEAD', '--staged', '--worktree', '--', ...head]));
  }
  ok(await ctx.run(['clean', '-fd', '--', ...paths]));
}
