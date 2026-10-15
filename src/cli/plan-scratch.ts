/**
 * The scratch planning tree: a detached worktree of the checkout cut from
 * HEAD at `<vcs.worktreeRoot>/<repo>/.planning/<folder>`, where a planner for an
 * unapproved change in the checkout runs. osq copies only the change folder's
 * plan files back, so nothing else in the checkout is touched.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { VcsConfig } from '../core/foundation/config-vcs.js';
import type { OsqConfig } from '../core/foundation/config.js';
import { runPrepare } from '../core/spec/approve-worktree.js';
import type { Vcs } from '../core/vcs/vcs.js';
import { worktreePath } from '../core/vcs/worktree.js';
import { snapshotPlanFiles } from '../watcher/auto-steer-plan.js';

/** `<vcs.worktreeRoot>/<repo>/.planning/<folder>`.
 *
 * @scenario cli-foundation: Planned in a scratch tree
 * @adr 019
 */
export function scratchTreePath(
  vcsConfig: VcsConfig,
  projectRoot: string,
  folderName: string,
): string {
  const worktree = worktreePath(vcsConfig, projectRoot, folderName);
  return path.join(path.dirname(worktree), '.planning', folderName);
}

/** One scratch tree's root and the change folder inside it. */
export interface ScratchTree {
  readonly root: string;
  readonly folderPath: string;
}

/** Everything `createScratchTree` needs. */
export interface ScratchInput {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly vcs: Vcs;
  readonly folderPath: string;
  readonly folderName: string;
}

function relativePosix(from: string, to: string): string {
  return path.relative(from, to).split(path.sep).join('/');
}

/** Write every file of `from` outside `.run/` into `to`, at the same path. */
async function copyPlanFiles(from: string, to: string): Promise<void> {
  for (const [relative, bytes] of await snapshotPlanFiles(from)) {
    const target = path.join(to, ...relative.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}

/**
 * Remove any earlier scratch tree, add a detached worktree at HEAD, prepare it,
 * and copy the change folder outside `.run/` into it. A failure removes the
 * half-built tree before it rethrows.
 *
 * @scenario cli-foundation: Planned in a scratch tree
 * @adr 019
 */
export async function createScratchTree(input: ScratchInput): Promise<ScratchTree> {
  const { projectRoot, config, vcs, folderPath, folderName } = input;
  const vcsConfig = config.vcs;
  if (vcsConfig === undefined) throw new Error('osq plan --run needs vcs.enabled');
  const root = scratchTreePath(vcsConfig, projectRoot, folderName);
  const folder = path.join(root, ...relativePosix(projectRoot, folderPath).split('/'));
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(path.dirname(root), { recursive: true });
  const base = (await vcs.head()).sha ?? 'HEAD';
  await vcs.worktreeAdd(root, base);
  try {
    await runPrepare(root, config, base);
    await copyPlanFiles(folderPath, folder);
  } catch (error) {
    await removeScratchTree(vcs, root);
    throw error;
  }
  return { root, folderPath: folder };
}

/**
 * Remove the scratch tree and drop git's record of it, whatever the run's
 * outcome.
 *
 * @scenario cli-foundation: Planned in a scratch tree
 * @adr 019
 */
export async function removeScratchTree(vcs: Vcs, root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
  await vcs.worktreePrune();
}

/**
 * Copy back every scratch file outside `.run/` that differs from `before`, and
 * remove from the change folder every file the scratch folder no longer holds.
 * Returns the sorted change-folder-relative paths it copied or removed.
 *
 * @scenario cli-foundation: Planned in a scratch tree
 * @adr 019
 */
export async function copyBackPlanFiles(
  changeFolder: string,
  scratchFolder: string,
  before: ReadonlyMap<string, Buffer>,
): Promise<string[]> {
  const after = await snapshotPlanFiles(scratchFolder);
  const changed: string[] = [];
  for (const relative of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(relative);
    const current = after.get(relative);
    const target = path.join(changeFolder, ...relative.split('/'));
    if (current === undefined) {
      if (previous === undefined) continue;
      await fs.rm(target, { force: true });
      changed.push(relative);
      continue;
    }
    if (previous?.equals(current)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, current);
    changed.push(relative);
  }
  return changed.sort();
}

/**
 * Append the scratch folder's `.run/events/planner.jsonl` to the change
 * folder's, when the planner wrote one.
 *
 * @scenario cli-foundation: Planned in a scratch tree
 * @adr 019
 */
export async function appendPlannerEvents(
  changeFolder: string,
  scratchFolder: string,
): Promise<void> {
  const from = path.join(scratchFolder, '.run', 'events', 'planner.jsonl');
  const data = await fs.readFile(from).catch(() => null);
  if (data === null || data.length === 0) return;
  const to = path.join(changeFolder, '.run', 'events', 'planner.jsonl');
  await fs.mkdir(path.dirname(to), { recursive: true });
  await fs.appendFile(to, data);
}
