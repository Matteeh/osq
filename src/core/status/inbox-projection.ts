import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { type AfterLandFailure, readAfterLandFailure } from '../vcs/land-after.js';
import { applySteeringItems } from './blocked-item.js';
import { changeTrees } from './change-locations.js';
import { readLastLook } from './inbox-cursor.js';
import { type PausedItem, projectPaused } from './inbox-paused.js';
import {
  type Inbox,
  type NeedsYouItem,
  type RunningItem,
  collectLandedItems,
  projectInbox,
} from './inbox.js';
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
  const needsYou = [
    ...(await applySteeringItems(overview, inbox.needsYou)),
    ...steered,
    ...afterLand,
    ...validatorFailing,
  ].sort((a, b) => compareNumericPrefix(a.change.id, b.change.id));
  return { ...inbox, needsYou, running };
}
