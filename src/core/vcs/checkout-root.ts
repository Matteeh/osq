import fs from 'node:fs/promises';
import type { OsqConfig } from '../foundation/config.js';
import { selectVcs } from './select.js';

const OSQ_BRANCH_PREFIX = 'osq/';

/** Resolve a path with symlinks, falling back to the raw path when absent. */
async function realpath(target: string): Promise<string> {
  return fs.realpath(target).catch(() => target);
}

/**
 * The main checkout when `cwd` is inside a linked worktree on an `osq/`
 * branch, else `cwd` unchanged. Never throws; any git error returns `cwd`.
 */
export async function resolveCheckoutRoot(cwd: string, config: OsqConfig): Promise<string> {
  try {
    if (config.vcs?.enabled !== true) return cwd;
    const vcs = await selectVcs(cwd, config);
    if (vcs.kind !== 'git') return cwd;

    const root = await vcs.root();
    if (root === null) return cwd;
    const head = await vcs.head();
    if (head.branch === null || !head.branch.startsWith(OSQ_BRANCH_PREFIX)) return cwd;

    const [rootReal, cwdReal] = await Promise.all([realpath(root), realpath(cwd)]);
    const main = (await vcs.worktreeList())[0];
    if (main === undefined) return cwd;
    const mainReal = await realpath(main.path);
    if (mainReal === rootReal || mainReal === cwdReal) return cwd;
    return main.path;
  } catch {
    return cwd;
  }
}
