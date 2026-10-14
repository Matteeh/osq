import { readActivePause } from '../run/usage-pause.js';
import type { InboxChangeRef, InboxTaskRef } from './inbox.js';
import type { StatusOverview } from './status.js';

/**
 * A paused running item: a task waiting for its usage-limit reset. It carries
 * no `pid`, `startedAt` or `elapsedSeconds`; those are what a live running item
 * has instead. They stay in the type as `never` so the shared running-item
 * union keeps live-item access typed, while a paused item stays key-exact at
 * runtime.
 */
export interface PausedItem {
  readonly change: InboxChangeRef;
  readonly task: InboxTaskRef;
  /** ISO time the task may run again. */
  readonly pausedUntil: string;
  readonly command: string;
  readonly pid: never;
  readonly startedAt: never;
  readonly elapsedSeconds: never;
}

function taskTitle(taskNumber: string, title: string, fileName: string): string {
  return title || fileName || taskNumber;
}

/**
 * The paused running items: one for each approved active change whose
 * `.run/paused.md` names one of its task numbers and has not passed.
 *
 * @scenario status-inspection: Paused task
 * @scenario status-inspection: No item for a passed pause
 */
export async function projectPaused(
  overview: StatusOverview,
  nowMs: number,
): Promise<PausedItem[]> {
  const items: PausedItem[] = [];
  for (const spec of overview.specs) {
    if (spec.approvedHash === null) continue;
    const pause = await readActivePause(spec.folderPath, nowMs);
    if (pause === null) continue;
    const task = spec.tasks.find((candidate) => candidate.taskNumber === pause.task);
    if (task === undefined) continue;
    items.push({
      change: { id: spec.id, title: spec.title },
      task: {
        number: task.taskNumber,
        title: taskTitle(task.taskNumber, task.title, task.fileName),
      },
      pausedUntil: pause.until,
      command: `osq show ${spec.id}`,
    } as PausedItem);
  }
  return items;
}
