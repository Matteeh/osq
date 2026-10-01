/** Why a sync stopped: a conflict, a changed requirement, a red verify, or any other failed step. */
export type SyncStopReason =
  | 'sync_conflict'
  | 'requirement_changed'
  | 'sync_verify_red'
  | 'sync_failed';

/**
 * The stop every sync failure throws. Its `reason` tells a caller whether the
 * default branch conflicted at a path the sync cannot resolve, changed a
 * requirement the change rewrites, turned a verify or check red, or whether
 * any other step, a failed prepare or commit included, stopped the sync.
 */
export class SyncStop extends Error {
  readonly reason: SyncStopReason;

  constructor(reason: SyncStopReason, message: string) {
    super(message);
    this.name = 'SyncStop';
    this.reason = reason;
  }
}
