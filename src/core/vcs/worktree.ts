import os from 'node:os';
import path from 'node:path';
import { DEFAULT_WORKTREE_ROOT, type VcsConfig } from '../foundation/config-vcs.js';

/** The branch the worktree of `folderName` checks out. */
export function worktreeBranch(folderName: string): string {
  return `osq/${folderName}`;
}

/** Expand a leading `~` in `root` to `home`. */
function expandHome(root: string, home: string): string {
  if (root === '~') return home;
  if (root.startsWith('~/')) return path.join(home, root.slice(2));
  return root;
}

/**
 * Where the worktree of `folderName` lives:
 * `<vcs.worktreeRoot>/<repo>/<folder>`, the root defaulting to
 * `~/.osq/worktrees` with `~` expanded to `home`.
 */
export function worktreePath(
  config: VcsConfig,
  repoRoot: string,
  folderName: string,
  home: string = os.homedir(),
): string {
  const root = expandHome(config.worktreeRoot ?? DEFAULT_WORKTREE_ROOT, home);
  return path.join(root, path.basename(repoRoot), folderName);
}
