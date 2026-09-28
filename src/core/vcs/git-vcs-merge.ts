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

/** Whether `ancestor` is `descendant` or one of its ancestors. */
export async function isAncestor(
  ctx: GitWriteContext,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  const result = await ctx.run(['merge-base', '--is-ancestor', ancestor, descendant]);
  return result.code === 0;
}
