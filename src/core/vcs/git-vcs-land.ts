import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { GitWriteContext } from './git-vcs-write.js';
import type { GitResult } from './git-vcs.js';
import type { VcsFastForwardResult, VcsStatusEntry } from './vcs.js';

/** Git's combined output, stdout first, as one error message. */
function combined(result: GitResult): string {
  return [result.stdout, result.stderr].filter((part) => part.length > 0).join('');
}

/** Git's stdout, or throw an `Error` holding its combined output. */
function ok(result: GitResult): string {
  if (result.code !== 0) throw new Error(combined(result));
  return result.stdout;
}

/** Split `Name <email>` into its parts, keeping the whole string as the name. */
function parseAuthor(author: string): { name: string; email: string } {
  const match = /^(.*?)\s*<(.*)>$/.exec(author);
  if (match === null) return { name: author, email: '' };
  return { name: match[1] ?? '', email: match[2] ?? '' };
}

/** Whether git is set to sign commits, though `commit-tree` ignores that. */
async function signCommits(ctx: GitWriteContext): Promise<boolean> {
  const result = await ctx.run(['config', '--type=bool', '--get', 'commit.gpgSign']);
  return result.code === 0 && result.stdout.trim() === 'true';
}

/**
 * Commit `source`'s tree with `parent` as its only parent, authored by
 * `author`, leaving the working tree, the index, and every ref untouched.
 * The message goes to git in a file, never as an argument, and `-S` is passed
 * when git is set to sign, because `commit-tree` ignores that setting.
 */
export async function commitTree(
  ctx: GitWriteContext,
  source: string,
  parent: string,
  message: string,
  author: string,
): Promise<string> {
  const sign = await signCommits(ctx);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-commit-'));
  const file = path.join(dir, 'message.txt');
  try {
    await fs.writeFile(file, message, 'utf8');
    const args = ['commit-tree', `${source}^{tree}`, '-p', parent, '-F', file];
    if (sign) args.push('-S');
    const { name, email } = parseAuthor(author);
    const env = { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email };
    return ok(await ctx.runCommit(args, env)).trim();
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Every path `commit` changes relative to HEAD, relative to the project root. */
async function changedPaths(ctx: GitWriteContext, commit: string): Promise<Set<string>> {
  const result = await ctx.run(['diff', '--name-only', '-z', 'HEAD', commit]);
  if (result.code !== 0) return new Set();
  return new Set(result.stdout.split('\0').filter((entry) => entry.length > 0));
}

/** The uncommitted paths among `status` that `commit` changes, sorted. */
function blockedPaths(status: readonly VcsStatusEntry[], changed: Set<string>): string[] {
  const blocked = new Set<string>();
  for (const entry of status) {
    if (changed.has(entry.path)) blocked.add(entry.path);
    if (entry.from !== undefined && changed.has(entry.from)) blocked.add(entry.from);
  }
  return [...blocked].sort();
}

/**
 * Fast-forward to `commit`, unless an uncommitted path `commit` changes would
 * be overwritten; then report those paths and write nothing.
 */
export async function fastForward(
  ctx: GitWriteContext,
  commit: string,
  status: readonly VcsStatusEntry[],
): Promise<VcsFastForwardResult> {
  const blocked = blockedPaths(status, await changedPaths(ctx, commit));
  if (blocked.length > 0) return { status: 'blocked', blocked };
  ok(await ctx.runCommit(['merge', '--ff-only', commit]));
  return { status: 'done', blocked: [] };
}

/** How many commits `to` has that `from` lacks, and 0 when either is unknown. */
export async function countCommits(
  ctx: GitWriteContext,
  from: string,
  to: string,
): Promise<number> {
  const result = await ctx.run(['rev-list', '--count', `${from}..${to}`]);
  if (result.code !== 0) return 0;
  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isNaN(count) ? 0 : count;
}
