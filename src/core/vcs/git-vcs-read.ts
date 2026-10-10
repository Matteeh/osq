import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { nonEmpty, parseStashes, parseStatus } from './git-vcs-parse.js';
import type { GitWriteContext } from './git-vcs-write.js';
import type { VcsHead, VcsStash, VcsStatusEntry } from './vcs.js';

/** The repository top level, or null when git cannot name one. */
export async function root(ctx: GitWriteContext): Promise<string | null> {
  const result = await ctx.run(['rev-parse', '--show-toplevel']);
  const top = result.stdout.trim();
  if (result.code !== 0 || top === '') return null;
  return fs.realpath(top).catch(() => top);
}

/** HEAD's commit and the branch it points to, each null when git cannot name one. */
export async function head(ctx: GitWriteContext): Promise<VcsHead> {
  const [commit, branch] = await Promise.all([
    ctx.run(['rev-parse', '--verify', '--quiet', 'HEAD']),
    ctx.run(['symbolic-ref', '--quiet', '--short', 'HEAD']),
  ]);
  return {
    sha: commit.code === 0 ? nonEmpty(commit.stdout) : null,
    branch: branch.code === 0 ? nonEmpty(branch.stdout) : null,
  };
}

/** A digest of the staged index, empty when git cannot read it. */
export async function indexDigest(ctx: GitWriteContext): Promise<string> {
  const result = await ctx.run(['ls-files', '--stage', '-z']);
  if (result.code !== 0) return '';
  return createHash('sha256').update(result.stdout).digest('hex');
}

/** Every stash with its commit and the branch it was made on. */
export async function stashList(ctx: GitWriteContext): Promise<VcsStash[]> {
  const result = await ctx.run(['stash', 'list', '--format=%H%x00%gs']);
  if (result.code !== 0) return [];
  return parseStashes(result.stdout);
}

/** The working tree's porcelain entries, untracked files included. */
export async function status(ctx: GitWriteContext): Promise<VcsStatusEntry[]> {
  const result = await ctx.run(['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (result.code !== 0) return [];
  return parseStatus(result.stdout);
}

/** One file's contents at a ref, or null when that ref has no such file. */
export async function show(
  ctx: GitWriteContext,
  ref: string,
  filePath: string,
): Promise<string | null> {
  const result = await ctx.run(['show', `${ref}:${filePath}`]);
  if (result.code !== 0) return null;
  return result.stdout;
}

/** Whether a file or directory exists at a ref; false when the ref is unknown. */
export async function pathExists(
  ctx: GitWriteContext,
  ref: string,
  filePath: string,
): Promise<boolean> {
  const result = await ctx.run(['cat-file', '-e', `${ref}:${filePath}`]);
  return result.code === 0;
}
