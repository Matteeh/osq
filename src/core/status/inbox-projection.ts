import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { applyBlockedItems } from './blocked-item.js';
import { changeTrees } from './change-locations.js';
import { readLastLook } from './inbox-cursor.js';
import { type Inbox, type NeedsYouItem, collectLandedItems, projectInbox } from './inbox.js';
import { type StatusOverview, getStatusOverview } from './status.js';

/** Injectable clock, config, and home root for the read-only projection. */
export interface ReadInboxOptions {
  readonly config?: OsqConfig;
  readonly now?: Date;
  readonly home?: string;
}

function changeId(folderName: string): string {
  return folderName.match(/^(\d+)/)?.[1] ?? folderName;
}

/** One needs-you item per archived change still awaiting a verification outcome. */
function projectPendingVerifications(overview: StatusOverview): NeedsYouItem[] {
  return (overview.pendingVerifications ?? []).map((pending) => {
    const id = changeId(pending.folderName);
    return {
      kind: pending.next.detail === 'failed' ? 'verification-failed' : 'verification-pending',
      change: { id, title: pending.title },
      task: null,
      command: pending.next.command ?? `osq verified ${id} --passed|--failed`,
    } satisfies NeedsYouItem;
  });
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
  const pending = projectPendingVerifications(overview);
  const needsYou = await applyBlockedItems(overview, [...inbox.needsYou, ...pending]);
  return { ...inbox, needsYou };
}
