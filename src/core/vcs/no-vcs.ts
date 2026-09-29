import { DEFAULT_BRANCH } from '../foundation/config-vcs.js';
import type {
  Vcs,
  VcsFastForwardResult,
  VcsHead,
  VcsMergeResult,
  VcsStash,
  VcsStatusEntry,
  VcsWorktree,
} from './vcs.js';

/** The port used when git is unavailable or the project root is not the repo top. */
export class NoVcs implements Vcs {
  readonly kind = 'none' as const;
  readonly unavailableReason: string;

  constructor(reason: string) {
    this.unavailableReason = reason;
  }

  /** Reject a write, naming the reason git is off. */
  private reject(): never {
    throw new Error(`git is off: ${this.unavailableReason}`);
  }

  async root(): Promise<string | null> {
    return null;
  }

  async head(): Promise<VcsHead> {
    return { sha: null, branch: null };
  }

  async indexDigest(): Promise<string> {
    return '';
  }

  async stashList(): Promise<VcsStash[]> {
    return [];
  }

  async status(): Promise<VcsStatusEntry[]> {
    return [];
  }

  async configValue(_key: string): Promise<string | null> {
    return null;
  }

  async hookNames(): Promise<string[]> {
    return [];
  }

  async defaultBranch(): Promise<string> {
    return DEFAULT_BRANCH;
  }

  async show(_ref: string, _path: string): Promise<string | null> {
    return null;
  }

  async pathExists(_ref: string, _path: string): Promise<boolean> {
    return false;
  }

  async listBranches(_prefix: string): Promise<string[]> {
    return [];
  }

  async worktreeList(): Promise<VcsWorktree[]> {
    return [];
  }

  async worktreePrune(): Promise<void> {
    this.reject();
  }

  async createBranch(_name: string, _base: string): Promise<void> {
    this.reject();
  }

  async renameBranch(_from: string, _to: string): Promise<void> {
    this.reject();
  }

  async worktreeAdd(_path: string, _branch: string): Promise<void> {
    this.reject();
  }

  async worktreeRemove(_path: string): Promise<void> {
    this.reject();
  }

  async commit(_paths: readonly string[], _message: string, _author: string): Promise<string> {
    this.reject();
  }

  async commitTree(
    _source: string,
    _parent: string,
    _message: string,
    _author: string,
  ): Promise<string> {
    this.reject();
  }

  async fastForward(_commit: string): Promise<VcsFastForwardResult> {
    this.reject();
  }

  async countCommits(_from: string, _to: string): Promise<number> {
    return 0;
  }

  async merge(_ref: string, _squash: boolean): Promise<VcsMergeResult> {
    this.reject();
  }

  async mergeAbort(): Promise<void> {
    this.reject();
  }

  async stage(_paths: readonly string[]): Promise<void> {
    this.reject();
  }

  async isAncestor(_ancestor: string, _descendant: string): Promise<boolean> {
    return false;
  }

  async patch(): Promise<string> {
    this.reject();
  }

  async discard(_paths: readonly string[]): Promise<void> {
    this.reject();
  }
}
