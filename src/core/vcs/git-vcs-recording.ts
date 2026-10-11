import type { OsqConfig } from '../foundation/config.js';
import { GitVcs } from './git-vcs.js';
import { appendTreeRecord, resolveTreeRecordPath } from './tree-record.js';
import type { VcsFastForwardResult } from './vcs.js';

/**
 * The `GitVcs` `selectVcs` returns: after each write that can change the trees
 * succeeds, it appends one line to the tree record. The record path is resolved
 * once, lazily, at its first recorded write, and a failure to resolve or append
 * is ignored. It adds no member to the `Vcs` port.
 *
 * @scenario version-control: Worktree add from the checkout
 * @scenario version-control: Commit in a linked worktree
 * @scenario version-control: Failed commit records nothing
 * @scenario version-control: Unwritable record
 * @adr 003
 */
export class RecordingGitVcs extends GitVcs {
  private resolution: Promise<string | null> | undefined;

  constructor(
    private readonly recordRoot: string,
    private readonly recordConfig: OsqConfig,
    private readonly recordBinary = 'git',
  ) {
    super(recordRoot, recordConfig, recordBinary);
  }

  /** The record path, resolved at most once per instance, or null when none. */
  private recordPath(): Promise<string | null> {
    this.resolution ??= resolveTreeRecordPath(
      this.recordRoot,
      this.recordConfig,
      this.recordBinary,
    ).catch(() => null);
    return this.resolution;
  }

  /** Append `op`'s line for this instance's root, ignoring any failure. */
  private async record(op: string): Promise<void> {
    const recordPath = await this.recordPath();
    if (recordPath === null) return;
    await appendTreeRecord(recordPath, op, this.recordRoot);
  }

  override async worktreeAdd(worktreePath: string, branch: string): Promise<void> {
    await super.worktreeAdd(worktreePath, branch);
    await this.record('worktree-add');
  }

  override async worktreeRemove(worktreePath: string): Promise<void> {
    await super.worktreeRemove(worktreePath);
    await this.record('worktree-remove');
  }

  override async worktreePrune(): Promise<void> {
    await super.worktreePrune();
    await this.record('worktree-prune');
  }

  override async commit(
    paths: readonly string[],
    message: string,
    author: string,
  ): Promise<string> {
    const commit = await super.commit(paths, message, author);
    await this.record('commit');
    return commit;
  }

  override async fastForward(commit: string): Promise<VcsFastForwardResult> {
    const result = await super.fastForward(commit);
    if (result.status === 'done') await this.record('fast-forward');
    return result;
  }
}
