import fs from 'node:fs/promises';
import { parseResultSections } from '../report/result-sections.js';
import type { NeedsYouItem } from './inbox.js';
import { getResultPath } from './layout.js';
import type { StatusOverview } from './status.js';
import type { SteeringTrigger } from './steering.js';

const NOT_STATED = '(not stated)';

/** The task result file's stated need, or `(not stated)` when it has none. */
async function readNeed(folderPath: string, taskNumber: string): Promise<string> {
  const content = await fs
    .readFile(getResultPath(folderPath, taskNumber), 'utf8')
    .catch(() => null);
  if (content === null) return NOT_STATED;
  return parseResultSections(content).blocked ?? NOT_STATED;
}

/** Whether a needs-you item is the halt item a trigger's target names. */
function isTriggerItem(item: NeedsYouItem, trigger: SteeringTrigger): boolean {
  if (trigger.target === 'change') return item.kind === 'change-regressed';
  return (
    (item.kind === 'task-dead' || item.kind === 'task-regressed') &&
    item.task?.number === trigger.target
  );
}

/**
 * Collapse each change that needs steering to its first trigger's halt item,
 * with `osq plan <id>`, the trigger, and, for a blocked task, the stated need.
 * Every other item, and every other change, is returned unchanged.
 */
export async function applySteeringItems(
  overview: StatusOverview,
  items: NeedsYouItem[],
): Promise<NeedsYouItem[]> {
  const steered = new Map(
    overview.specs
      .filter((spec) => (spec.steering?.length ?? 0) > 0)
      .map((spec) => [spec.id, spec] as const),
  );
  const result: NeedsYouItem[] = [];
  for (const item of items) {
    const spec = steered.get(item.change.id);
    if (spec === undefined) {
      result.push(item);
      continue;
    }
    const first = spec.steering?.[0];
    if (first === undefined || !isTriggerItem(item, first)) continue;
    const transformed = {
      ...item,
      command: `osq plan ${spec.id}`,
      steering: { trigger: first.trigger, reason: first.reason },
    } satisfies NeedsYouItem;
    if (first.trigger !== 'blocked' || item.task === null) {
      result.push(transformed);
      continue;
    }
    const need = await readNeed(spec.folderPath, item.task.number);
    result.push({ ...transformed, blocked: { need } });
  }
  return result;
}
