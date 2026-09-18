import { type LockResult, acquireLock, releaseLock } from '../core/lock.js';

/**
 * Acquire the exclusive running lock for a task's `.run` directory. Thin
 * wrapper over the core lock so the watcher tier owns a single integration
 * point.
 */
export async function acquireTaskLock(
  runDir: string,
  taskNumber: string | number,
): Promise<LockResult> {
  return acquireLock(runDir, taskNumber);
}

/** Release the task lock, tolerating an already-absent marker. */
export async function releaseTaskLock(runDir: string, taskNumber: string | number): Promise<void> {
  await releaseLock(runDir, taskNumber);
}
