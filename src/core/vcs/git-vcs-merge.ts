import type { GitWriteContext } from './git-vcs-write.js';
import type { GitResult } from './git-vcs.js';
import type { VcsMergeResult } from './vcs.js';

/** Git's combined output, stdout first, as one error message. */
function combined(result: GitResult): string {
  return [result.stdout, result.stderr].filter((part) => part.length > 0).join('');
}

/** Unmerged paths relative to the project root, sorted; empty when there are none. */
async function unmergedPaths(ctx: GitWriteContext): Promise<string[]> {
  const result = await ctx.run(['diff', '--name-only', '--diff-filter=U', '-z']);
  if (result.code !== 0) return [];
  return result.stdout
    .split('\0')
    .filter((entry) => entry.length > 0)
    .sort();
}

/**
 * Merge `ref` without committing (`squash` false) or squash it (`squash`
 * true). A clean merge leaves the result staged and uncommitted. When git
 * refuses to start the merge, it fails with git's output and changes nothing.
 */
export async function merge(
  ctx: GitWriteContext,
  ref: string,
  squash: boolean,
): Promise<VcsMergeResult> {
  const args = squash ? ['merge', '--squash', ref] : ['merge', '--no-ff', '--no-commit', ref];
  const result = await ctx.runCommit(args);
  if (result.code === 0) return { status: 'clean', conflicts: [] };
  const conflicts = await unmergedPaths(ctx);
  if (conflicts.length === 0) throw new Error(combined(result));
  return { status: 'conflict', conflicts };
}

/** Run `git merge --abort`, failing with git's output when it cannot. */
export async function mergeAbort(ctx: GitWriteContext): Promise<void> {
  const result = await ctx.runCommit(['merge', '--abort']);
  if (result.code !== 0) throw new Error(combined(result));
}

/** Stage exactly `paths`, deletions included. */
export async function stage(ctx: GitWriteContext, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const result = await ctx.run(['add', '-A', '--', ...paths]);
  if (result.code !== 0) throw new Error(combined(result));
}

/** Rename `from` to `to`, keeping every commit; git refuses a taken name. */
export async function renameBranch(ctx: GitWriteContext, from: string, to: string): Promise<void> {
  const result = await ctx.run(['branch', '-m', from, to]);
  if (result.code !== 0) throw new Error(combined(result));
}

/** Whether `ancestor` is `descendant` or one of its ancestors. */
export async function isAncestor(
  ctx: GitWriteContext,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const result = await ctx.run(['merge-base', '--is-ancestor', ancestor, descendant]);
  return result.code === 0;
}

/**
 * The merge base git names for `a` and `b`, or null when they share no commit
 * or either ref is unknown.
 *
 * @scenario version-control: Merge base of two branches
 * @adr 003
 */
export async function mergeBase(
  ctx: GitWriteContext,
  a: string,
  b: string,
): Promise<string | null> {
  const result = await ctx.run(['merge-base', a, b]);
  if (result.code !== 0) return null;
  const base = result.stdout.trim();
  return base.length > 0 ? base : null;
}

/** The byte git prints between commits in `trailerValues`'s log format. */
const RECORD_SEPARATOR = '\u001e';

/** The byte git prints between a commit's trailer values in that format. */
const UNIT_SEPARATOR = '\u001f';

/**
 * The trimmed value of every `key` trailer, newest commit first, on the
 * commits `to` has and `from` lacks. Empty when a ref is unknown or no commit
 * carries the trailer.
 *
 * @scenario version-control: Trailer values in a range
 * @adr 003
 */
export async function trailerValues(
  ctx: GitWriteContext,
  from: string,
  to: string,
  key: string,
): Promise<string[]> {
  const format = `%x1e%(trailers:key=${key},valueonly,separator=%x1f)`;
  const result = await ctx.run(['log', `--format=${format}`, `${from}..${to}`]);
  if (result.code !== 0) return [];
  const values: string[] = [];
  for (const record of result.stdout.split(RECORD_SEPARATOR)) {
    for (const value of record.split(UNIT_SEPARATOR)) {
      const trimmed = value.trim();
      if (trimmed.length > 0) values.push(trimmed);
    }
  }
  return values;
}
