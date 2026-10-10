import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { type AfterLandFailure, readAfterLandFailure } from '../vcs/land-after.js';
import { applySteeringItems } from './blocked-item.js';
import { changeTrees } from './change-locations.js';
import { readLastLook } from './inbox-cursor.js';
import { type Inbox, type NeedsYouItem, collectLandedItems, projectInbox } from './inbox.js';
import { compareNumericPrefix } from './state.js';
import { getStatusOverview } from './status.js';
import { type SteeringChange, listArchivedSteering } from './steering-change.js';

/** Injectable clock, config, and home root for the read-only projection. */
export interface ReadInboxOptions {
  readonly config?: OsqConfig;
  readonly now?: Date;
  readonly home?: string;
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

/**
 * Derives the stable inbox object without mutating any file. Both the CLI and
 * the read-only HTTP transport consume it, so a contemporaneous invocation and
 * request observe the same groups while only the CLI advances the cursor.
 *
 * @scenario status-inspection: Failed after-land command waiting
 * @scenario status-inspection: No failure recorded
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
  const steered = (await listArchivedSteering(projectRoot, config))
    .map(archivedSteeringItem)
    .filter((item): item is NeedsYouItem => item !== null);
  const failure = await readAfterLandFailure(projectRoot, options.home);
  const afterLand = failure === null ? [] : [await afterLandFailedItem(tree.archiveDir, failure)];
  const needsYou = [
    ...(await applySteeringItems(overview, inbox.needsYou)),
    ...steered,
    ...afterLand,
  ].sort((a, b) => compareNumericPrefix(a.change.id, b.change.id));
  return { ...inbox, needsYou };
}
