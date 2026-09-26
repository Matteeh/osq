/**
 * The read-only version-control port. Nothing here runs git; the git and
 * no-git implementations live beside it and are chosen by `selectVcs`.
 */
export interface VcsHead {
  /** HEAD's commit; null in a repository with no commit. */
  readonly sha: string | null;
  /** The branch HEAD points to; null when HEAD is detached. */
  readonly branch: string | null;
}

export interface VcsStash {
  readonly sha: string;
  /** The branch the stash was made on; null when HEAD was detached. */
  readonly branch: string | null;
}

export interface VcsStatusEntry {
  /** Path relative to the project root. */
  readonly path: string;
  /** The two-letter porcelain v1 code, such as ` M`, `A ` or `??`. */
  readonly code: string;
  /** The old path of a rename or copy. */
  readonly from?: string;
}

/** One entry of `git worktree list`, with its branch and HEAD. */
export interface VcsWorktree {
  /** Absolute path of the worktree. */
  readonly path: string;
  /** The branch the worktree has checked out; null when detached. */
  readonly branch: string | null;
  /** The worktree's HEAD commit; null in an unborn worktree. */
  readonly head: string | null;
}

export interface Vcs {
  readonly kind: 'git' | 'none';
  /** The reason git is off; null for `GitVcs`. */
  readonly unavailableReason: string | null;
  root(): Promise<string | null>;
  head(): Promise<VcsHead>;
  indexDigest(): Promise<string>;
  stashList(): Promise<VcsStash[]>;
  status(): Promise<VcsStatusEntry[]>;
  configValue(key: string): Promise<string | null>;
  hookNames(): Promise<string[]>;
  /** Origin's default branch, then `vcs.defaultBranch`, then `main`. */
  defaultBranch(): Promise<string>;
  /** One file's contents at a ref, or null when that ref has no such file. */
  show(ref: string, path: string): Promise<string | null>;
  listBranches(prefix: string): Promise<string[]>;
  createBranch(name: string, base: string): Promise<void>;
  worktreeAdd(path: string, branch: string): Promise<void>;
  worktreeRemove(path: string): Promise<void>;
  worktreeList(): Promise<VcsWorktree[]>;
  /** Drop git's records of worktrees whose directory no longer exists. */
  worktreePrune(): Promise<void>;
  commit(paths: readonly string[], message: string, author: string): Promise<string>;
  patch(): Promise<string>;
  discard(paths: readonly string[]): Promise<void>;
}
