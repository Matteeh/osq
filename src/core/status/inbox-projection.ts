import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { applyBlockedItems } from './blocked-item.js';
import { changeTrees } from './change-locations.js';
import { readLastLook } from './inbox-cursor.js';
import { type Inbox, collectLandedItems, projectInbox } from './inbox.js';
import { getStatusOverview } from './status.js';

/** Injectable clock, config, and home root for the read-only projection. */
export interface ReadInboxOptions {
  readonly config?: OsqConfig;
  readonly now?: Date;
  readonly home?: string;
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
  const needsYou = await applyBlockedItems(overview, inbox.needsYou);
  return { ...inbox, needsYou };
}
