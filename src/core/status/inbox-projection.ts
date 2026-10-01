import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
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

/**
 * Derives the stable inbox object without mutating any file. Both the CLI and
 * the read-only HTTP transport consume it, so a contemporaneous invocation and
 * request observe the same groups while only the CLI advances the cursor.
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
  const needsYou = [...(await applySteeringItems(overview, inbox.needsYou)), ...steered].sort(
    (a, b) => compareNumericPrefix(a.change.id, b.change.id),
  );
  return { ...inbox, needsYou };
}
