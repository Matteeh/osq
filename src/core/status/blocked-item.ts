import fs from 'node:fs/promises';
import { parseResultSections } from '../report/result-sections.js';
import type { NeedsYouItem } from './inbox.js';
import { getResultPath } from './layout.js';
import type { TaskState } from './state.js';
import type { StatusOverview } from './status.js';

const NOT_STATED = '(not stated)';
const REJECT_REASON = '--reason <text>';

/** The task state behind a task-dead item, when the overview still holds it. */
function findTask(
  overview: StatusOverview,
  item: NeedsYouItem,
): { spec: { folderPath: string }; task: TaskState } | null {
  const spec = overview.specs.find((candidate) => candidate.id === item.change.id);
  if (!spec) return null;
  const taskNumber = item.task?.number;
  if (!taskNumber) return null;
  const task = spec.tasks.find((candidate) => candidate.taskNumber === taskNumber);
  return task ? { spec, task } : null;
}

/** The task result file's stated need, or `(not stated)` when it has none. */
async function readNeed(folderPath: string, taskNumber: string): Promise<string> {
  const content = await fs
    .readFile(getResultPath(folderPath, taskNumber), 'utf8')
    .catch(() => null);
  if (content === null) return NOT_STATED;
  return parseResultSections(content).blocked ?? NOT_STATED;
}

/**
 * Annotate `task-dead` items whose task died blocked with the stated need and
 * the reject-and-replan command. Every other item is returned unchanged.
 */
export async function applyBlockedItems(
  overview: StatusOverview,
  items: NeedsYouItem[],
): Promise<NeedsYouItem[]> {
  return Promise.all(
    items.map(async (item) => {
      if (item.kind !== 'task-dead') return item;
      const found = findTask(overview, item);
      if (!found || found.task.deadReason !== 'blocked') return item;
      const need = await readNeed(found.spec.folderPath, found.task.taskNumber);
      return {
        ...item,
        command: `osq reject ${item.change.id} ${REJECT_REASON}`,
        blocked: { need },
      } satisfies NeedsYouItem;
    }),
  );
}
