import { DEFAULT_BRANCH } from '../foundation/config-vcs.js';
import type { Vcs, VcsHead, VcsStash, VcsStatusEntry, VcsWorktree } from './vcs.js';

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

  async worktreeAdd(_path: string, _branch: string): Promise<void> {
    this.reject();
  }

  async worktreeRemove(_path: string): Promise<void> {
    this.reject();
  }

  async commit(_paths: readonly string[], _message: string, _author: string): Promise<string> {
    this.reject();
  }

  async patch(): Promise<string> {
    this.reject();
  }

  async discard(_paths: readonly string[]): Promise<void> {
    this.reject();
  }
}
