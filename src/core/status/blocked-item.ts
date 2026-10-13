import fs from 'node:fs/promises';
import { parseResultSections } from '../report/result-sections.js';
import { currentAutoSteer } from '../run/auto-steer-record.js';
import { parseFrontmatter } from '../spec/parser.js';
import type { NeedsYouItem } from './inbox.js';
import { getDeadMarkerPath, getResultPath } from './layout.js';
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

/**
 * The need for a task that died with `entry_missing`: the dead marker's
 * `- <path>` lines as `missing entry files <paths>`, or `(not stated)` when the
 * marker is unreadable or lists none.
 */
async function readMissingEntryNeed(folderPath: string, taskNumber: string): Promise<string> {
  const content = await fs
    .readFile(getDeadMarkerPath(folderPath, taskNumber), 'utf8')
    .catch(() => null);
  if (content === null) return NOT_STATED;
  const paths = parseFrontmatter(content)
    .body.split('\n')
    .map((line) => line.match(/^-\s+(.+)$/)?.[1]?.trim())
    .filter((entry): entry is string => entry !== undefined && entry.length > 0);
  if (paths.length === 0) return NOT_STATED;
  return `missing entry files ${paths.join(', ')}`;
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
 * with the automatic planner's outcome, the trigger, and, for a blocked task,
 * the stated need. Every other item, and every other change, is returned
 * unchanged.
 *
 * @scenario status-inspection: Missing entry file in the inbox
 * @scenario status-inspection: Ready plan in the inbox
 * @scenario status-inspection: Automatic planner left lint red
 * @scenario status-inspection: Record for an earlier trigger
 * @adr 018
 * @adr 006
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
    const record = await currentAutoSteer(spec);
    const ready = record?.outcome === 'ready';
    const transformed = {
      ...item,
      command: ready ? `osq approve ${spec.id}` : `osq plan ${spec.id}`,
      steering: { trigger: first.trigger, reason: first.reason },
      ...(record !== null
        ? { autoSteer: { outcome: record.outcome, changed: record.changed } }
        : {}),
    } satisfies NeedsYouItem;
    if (first.trigger !== 'blocked' || item.task === null) {
      result.push(transformed);
      continue;
    }
    const need =
      first.reason === 'entry_missing'
        ? await readMissingEntryNeed(spec.folderPath, item.task.number)
        : await readNeed(spec.folderPath, item.task.number);
    result.push({ ...transformed, blocked: { need } });
  }
  return result;
}
