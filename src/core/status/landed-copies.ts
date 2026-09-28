import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChangeLocation, ChangeTree, LocatedChange } from './change-locations.js';

/** The canonical directory of `location` in `root`, or null when it never lands. */
function landedDir(root: ChangeTree, location: ChangeLocation): string | null {
  if (location === 'archived') return root.archiveDir;
  if (location === 'rejected') return root.rejectedDir;
  return null;
}

/**
 * Drop a worktree or stacked tree's archived or rejected folder when the
 * project root holds the same folder in the same location. The checkout's copy
 * is the landed one, so a kept worktree must not report it a second time. An
 * active folder always belongs to the tree that names it and is never dropped.
 */
export async function filterLandedCopies(
  root: ChangeTree,
  changes: readonly LocatedChange[],
): Promise<LocatedChange[]> {
  const kept: LocatedChange[] = [];
  for (const change of changes) {
    const dir = landedDir(root, change.location);
    const holds =
      dir !== null &&
      (await fs
        .stat(path.join(dir, change.folderName))
        .then((stat) => stat.isDirectory())
        .catch(() => false));
    if (!holds) kept.push(change);
  }
  return kept;
}
