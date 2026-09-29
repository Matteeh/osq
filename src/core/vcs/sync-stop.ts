/** Why a sync stopped: a merge conflict, or any other failed step. */
export type SyncStopReason = 'sync_conflict' | 'sync_failed';

/**
 * The stop every sync failure throws. Its `reason` tells a caller whether the
 * default branch conflicted at a path the sync cannot resolve, or whether any
 * other step, a red verify or a failed commit included, stopped the sync.
 */
export class SyncStop extends Error {
  readonly reason: SyncStopReason;

  constructor(reason: SyncStopReason, message: string) {
    super(message);
    this.name = 'SyncStop';
    this.reason = reason;
  }
}
