import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { awaitedDependencies } from '../spec/stack-dependencies.js';
import { selectVcs } from '../vcs/select.js';
import { listChanges } from './change-locations.js';
import type { NeedsYouItem } from './inbox.js';

/** The change id a folder name starts with, or the folder name itself. */
function changeId(folderName: string): string {
  return folderName.match(/^(\d+)/)?.[1] ?? folderName;
}

/** Whether the folder holds an `.run/approved` marker. */
async function isApproved(folderPath: string): Promise<boolean> {
  return fs
    .access(path.join(folderPath, '.run', 'approved'))
    .then(() => true)
    .catch(() => false);
}

/**
 * The needs-you items for active changes whose overlapped change was approved
 * again after the overlap line recorded its hash. Nothing is written.
 *
 * @scenario status-inspection: Overlap approved again in the inbox
 * @adr 008
 */
export async function readOverlapReapproved(
  projectRoot: string,
  config: OsqConfig,
): Promise<NeedsYouItem[]> {
  if (config.vcs?.enabled !== true) return [];
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return [];

  const items: NeedsYouItem[] = [];
  const seen = new Set<string>();
  for (const change of await listChanges(projectRoot, config, ['active'])) {
    if (change.location !== 'active' || seen.has(change.folderName)) continue;
    seen.add(change.folderName);
    if (!(await isApproved(change.folderPath))) continue;

    const awaited = await awaitedDependencies(projectRoot, config, vcs, change.folderPath);
    const reapproved = awaited.filter((entry) => entry.reapproved === true);
    if (reapproved.length === 0) continue;

    const spec = await parseSpecMdFromFolder(change.folderPath).catch(() => null);
    const id = changeId(change.folderName);
    const title = spec?.title || change.folderName;
    for (const entry of reapproved) {
      items.push({
        kind: 'overlap-reapproved',
        change: { id, title },
        task: null,
        command: `osq show ${id}`,
        overlapReapproved: { folder: entry.folder, capabilities: [...(entry.overlap ?? [])] },
      });
    }
  }
  return items;
}
