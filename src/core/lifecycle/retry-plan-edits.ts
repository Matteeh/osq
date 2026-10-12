import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import type { LocatedChange } from '../status/change-locations.js';
import { findChange } from '../status/change-locations.js';
import { selectVcs } from '../vcs/select.js';
import type { VcsStatusEntry } from '../vcs/vcs.js';

/** The only uncommitted path a worktree retry tolerates besides its `.run/`. */
const TASKS_FILE = 'tasks.md';

/**
 * The status entries inside the change folder that a retry must refuse, as
 * paths relative to the change folder, sorted. Both the path and the old path
 * of a rename or copy count, as `worktreeDirt` does.
 */
function planEditPaths(entries: readonly VcsStatusEntry[], changeRel: string): string[] {
  const prefix = `${changeRel}/`;
  const runPrefix = `${changeRel}/.run/`;
  const edits = new Set<string>();
  for (const entry of entries) {
    for (const candidate of [entry.path, entry.from]) {
      if (candidate === undefined) continue;
      if (!candidate.startsWith(prefix)) continue;
      if (candidate === `${changeRel}/${TASKS_FILE}`) continue;
      if (candidate.startsWith(runPrefix)) continue;
      edits.add(candidate.slice(prefix.length));
    }
  }
  return [...edits].sort();
}

/**
 * Refuse a retry while a change running in an osq worktree holds plan edits its
 * last commit lacks, naming them, so a revised plan is approved first. Finds
 * the change as `retrySpec` does, and returns without effect for a missing
 * change, a change outside a worktree, or `NoVcs`. Writes nothing.
 * @scenario watcher-and-harness: Plan edits not committed
 * @adr 003
 */
export async function assertPlanCommitted(
  projectRoot: string,
  specId: string,
  config: OsqConfig,
): Promise<void> {
  const change: LocatedChange | null = await findChange(projectRoot, config, specId).catch(
    () => null,
  );
  if (change === null) return;
  if (change.tree.worktreeFolder === undefined) return;

  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return;

  const changeRel = path.relative(change.tree.root, change.folderPath).split(path.sep).join('/');
  const edits = planEditPaths(await vcs.status(), changeRel);
  if (edits.length === 0) return;

  const folderName = path.basename(change.folderPath);
  const id = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  throw new Error(
    `Change ${id} has plan edits not committed in its worktree: ${edits.join(', ')}. ` +
      `Run osq approve ${id} to approve them.`,
  );
}
