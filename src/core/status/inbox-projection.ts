import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { type AfterLandFailure, readAfterLandFailure } from '../vcs/land-after.js';
import { type AutopilotStop, readAutopilotStop } from './autopilot-stop.js';
import { applySteeringItems } from './blocked-item.js';
import { changeTrees, listChanges, matchesFolder } from './change-locations.js';
import { readLastLook } from './inbox-cursor.js';
import { type PausedItem, projectPaused } from './inbox-paused.js';
import {
  type Inbox,
  type NeedsYouItem,
  type RunningItem,
  collectLandedItems,
  projectInbox,
} from './inbox.js';
import { readQueue } from './queue-parser.js';
import { compareNumericPrefix } from './state.js';
import { getStatusOverview } from './status.js';
import { type SteeringChange, listArchivedSteering } from './steering-change.js';
import { type ValidatorFailing, readValidatorFailing } from './validator-failing.js';

/** Injectable clock, config, and home root for the read-only projection. */
export interface ReadInboxOptions {
  readonly config?: OsqConfig;
  readonly now?: Date;
  readonly home?: string;
}

function runningKey(item: RunningItem | PausedItem): string {
  return `${item.change.id}\u0000${item.task.number}`;
}

function compareRunning(a: RunningItem | PausedItem, b: RunningItem | PausedItem): number {
  return (
    compareNumericPrefix(a.change.id, b.change.id) ||
    compareNumericPrefix(a.task.number, b.task.number)
  );
}

/** The one needs-you item an archived change that needs steering contributes. */
function archivedSteeringItem(entry: SteeringChange): NeedsYouItem | null {
  const first = entry.state.steering?.[0];
  if (first === undefined) return null;
  return {
    kind: 'change-regressed',
    change: { id: entry.state.id, title: entry.state.title || entry.change.folderName },
    task: null,
    command: `osq plan ${entry.state.id}`,
    steering: { trigger: first.trigger, reason: first.reason },
  };
}

/** The one needs-you item a recorded after-land failure contributes. */
async function afterLandFailedItem(
  archiveDir: string,
  failure: AfterLandFailure,
): Promise<NeedsYouItem> {
  const spec = await parseSpecMdFromFolder(path.join(archiveDir, failure.change)).catch(() => null);
  const id = failure.change.match(/^(\d+)/)?.[1] ?? failure.change;
  return {
    kind: 'after-land-failed',
    change: { id, title: spec?.title || failure.change },
    task: null,
    command: `osq land ${id}`,
  };
}

/** The one needs-you item the latest failing validator run contributes. */
async function validatorFailingItem(
  archiveDir: string,
  failing: ValidatorFailing,
): Promise<NeedsYouItem> {
  const spec = await parseSpecMdFromFolder(path.join(archiveDir, failing.change)).catch(() => null);
  const id = failing.change.match(/^(\d+)/)?.[1] ?? failing.change;
  return {
    kind: 'validator-failing',
    change: { id, title: spec?.title || failing.change },
    task: null,
    command: `osq show ${id}`,
    validatorFailing: { outcome: failing.outcome, runs: failing.runs, error: failing.error },
  };
}

/** The change title for a stopped item, or the id when it cannot be read. */
async function stopChangeTitle(
  projectRoot: string,
  config: OsqConfig,
  stop: AutopilotStop,
): Promise<string> {
  if (stop.change !== undefined) {
    const changes = await listChanges(projectRoot, config);
    const change = changes.find((entry) => matchesFolder(entry.folderName, stop.change ?? ''));
    const spec =
      change === undefined
        ? null
        : await parseSpecMdFromFolder(change.folderPath).catch(() => null);
    return spec?.title || stop.change;
  }
  const items = await readQueue(projectRoot, config).catch(() => []);
  return items.find((item) => item.slug === stop.item)?.title || stop.item;
}

/** The one needs-you item a recorded autopilot stop contributes. */
async function autopilotStoppedItem(
  projectRoot: string,
  config: OsqConfig,
  stop: AutopilotStop,
): Promise<NeedsYouItem> {
  const id = stop.change ?? stop.item;
  return {
    kind: 'autopilot-stopped',
    change: { id, title: await stopChangeTitle(projectRoot, config, stop) },
    task: null,
    command: stop.command,
    autopilotStopped: {
      reason: stop.reason,
      item: stop.item,
      change: stop.change ?? null,
      detail: stop.detail ?? null,
    },
  };
}

/**
 * Derives the stable inbox object without mutating any file. Both the CLI and
 * the read-only HTTP transport consume it, so a contemporaneous invocation and
 * request observe the same groups while only the CLI advances the cursor.
 *
 * @scenario status-inspection: Failed after-land command waiting
 * @scenario status-inspection: No failure recorded
 * @scenario status-inspection: Validator failing
 * @scenario status-inspection: No validator runs
 * @scenario status-inspection: Paused task
 * @scenario status-inspection: No item for a passed pause
 * @scenario status-inspection: Paused running item keys
 * @scenario status-inspection: Stop with a change in the inbox
 * @scenario status-inspection: Stop before a change in the inbox
 * @scenario status-inspection: No stop in the inbox
 * @adr 021
 * @adr 010
 */
export async function readInbox(
  projectRoot: string,
  options: ReadInboxOptions = {},
): Promise<Inbox> {
  const config = options.config ?? DEFAULT_CONFIG;
  const now = options.now ?? new Date();
  const overview = await getStatusOverview(projectRoot, config);
  const lastLookMs = await readLastLook(projectRoot, options.home);
  const [tree] = await changeTrees(projectRoot, config);
  const landed = await collectLandedItems(tree.archiveDir, lastLookMs);
  const inbox = projectInbox(overview, landed, now.getTime());
  const paused = await projectPaused(overview, now.getTime());
  const live = new Set(inbox.running.map(runningKey));
  const running = [...inbox.running, ...paused.filter((item) => !live.has(runningKey(item)))].sort(
    compareRunning,
  );
  const steered = (await listArchivedSteering(projectRoot, config))
    .map(archivedSteeringItem)
    .filter((item): item is NeedsYouItem => item !== null);
  const failure = await readAfterLandFailure(projectRoot, options.home);
  const afterLand = failure === null ? [] : [await afterLandFailedItem(tree.archiveDir, failure)];
  const failing = await readValidatorFailing(projectRoot, config);
  const validatorFailing =
    failing === null ? [] : [await validatorFailingItem(tree.archiveDir, failing)];
  const stop = await readAutopilotStop(projectRoot, config);
  const autopilotStopped =
    stop === null ? [] : [await autopilotStoppedItem(projectRoot, config, stop)];
  const needsYou = [
    ...(await applySteeringItems(overview, inbox.needsYou)),
    ...steered,
    ...afterLand,
    ...validatorFailing,
    ...autopilotStopped,
  ].sort((a, b) => compareNumericPrefix(a.change.id, b.change.id));
  return { ...inbox, needsYou, running };
}
