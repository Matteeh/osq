import type { Vcs, VcsHead, VcsStash, VcsStatusEntry } from './vcs.js';

/** The port used when git is unavailable or the project root is not the repo top. */
export class NoVcs implements Vcs {
  readonly kind = 'none' as const;
  readonly unavailableReason: string;

  constructor(reason: string) {
    this.unavailableReason = reason;
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
}
