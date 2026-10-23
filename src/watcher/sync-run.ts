import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { awaitedDependencies } from '../core/spec/stack-dependencies.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import type { SpecState } from '../core/status/state.js';
import { selectVcs } from '../core/vcs/select.js';
import { syncWithDefaultBranch } from '../core/vcs/sync-main.js';
import { SyncStop } from '../core/vcs/sync-stop.js';
import { readRetryContext } from './attempt.js';
import type { WorktreeHalt } from './worktree-run.js';

/** A thrown value's message, for a halt's detail. */
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Whether the hook runs before the change's next task is spawned. It does when
 * no task of the change is done yet, or when the next task's attempt follows an
 * earlier one, counted from its own events.
 *
 * @scenario watcher-and-harness: Sync before a retried attempt
 * @scenario watcher-and-harness: Sync stop before a retried attempt
 * @adr 012
 * @adr 018
 */
export async function syncBeforeSpawn(
  change: LocatedChange,
  specState: SpecState,
): Promise<boolean> {
  if (specState.tasks.every((task) => task.status !== 'done')) return true;
  const next = specState.nextTask;
  if (next === null) return false;
  const retry = await readRetryContext(change.folderPath, next.taskNumber);
  return retry.attempt > 1;
}

/**
 * Take the default branch into the change's branch before its first task or
 * before archive, logging the sync's progress line. A stacked dependent waits
 * while any awaited dependency remains: its branch holds the dependency's
 * archive until the dependency lands. When the sync stops it returns the halt
 * the caller records; otherwise it returns null, whether it merged, had
 * nothing to merge, or was left alone for an awaited dependency.
 */
export async function checkSync(
  projectRoot: string,
  change: LocatedChange,
  config: OsqConfig,
  logger?: Logger,
): Promise<WorktreeHalt | null> {
  if (config.vcs?.enabled !== true) return null;
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return null;
  const awaited = await awaitedDependencies(projectRoot, config, vcs, change.folderPath);
  if (awaited.length > 0) return null;
  try {
    await syncWithDefaultBranch(projectRoot, config, change, (line) => logger?.info(line));
    return null;
  } catch (err) {
    if (err instanceof SyncStop) return { reason: err.reason, detail: err.message };
    return { reason: 'sync_failed', detail: errorMessage(err) };
  }
}
