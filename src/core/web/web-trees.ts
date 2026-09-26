import path from 'node:path';
import type { ChangeTree } from '../status/change-locations.js';
import { numericIdOf } from './web-data-folders.js';

/** Folder key directly under `base` that contains `target`, or null. */
function folderKeyWithin(base: string, target: string): string | null {
  const relative = path.relative(base, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  const key = relative.split(path.sep)[0];
  return key === undefined || key === '' || key === '.' ? null : key;
}

/** Whether `target` is `base` itself or a path strictly inside it. */
function withinOrEqual(base: string, target: string): boolean {
  const relative = path.relative(base, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * Leading numeric id for a path inside exactly one change folder, or `null`
 * when the path belongs to shared state: capability specs, root layout, or an
 * unrecognized folder.
 */
export function classifyChangePath(
  target: string,
  changesDir: string,
  archiveDir: string,
  rejectedDir: string,
): number | null {
  for (const base of [archiveDir, rejectedDir]) {
    const key = folderKeyWithin(base, target);
    if (key !== null) return numericIdOf(key);
  }
  const key = folderKeyWithin(changesDir, target);
  if (key === null || key === 'archive' || key === 'rejected') return null;
  return numericIdOf(key);
}

/**
 * The one tree changes live in, built synchronously for direct callers such as
 * focused tests. `changeTrees` is async only because worktree discovery awaits
 * git, so this mirrors the single tree it returns when vcs is off.
 */
export function singleChangeTree(projectRoot: string, openspecRoot: string): ChangeTree {
  const root = path.resolve(projectRoot);
  const changesDir = path.join(root, openspecRoot, 'changes');
  return {
    root,
    changesDir,
    archiveDir: path.join(changesDir, 'archive'),
    rejectedDir: path.join(changesDir, 'rejected'),
  };
}

/**
 * Leading numeric id for a path across every resolved change tree. A worktree
 * tree contributes only the folder its `worktreeFolder` names; the first tree
 * classifies its active, archived, and rejected folders as before. A shared
 * path returns null, which callers treat as a global invalidation.
 */
export function classifyTreePath(target: string, trees: readonly ChangeTree[]): number | null {
  for (const tree of trees) {
    if (tree.worktreeFolder === undefined) continue;
    const folder = path.resolve(tree.changesDir, tree.worktreeFolder);
    if (withinOrEqual(folder, target)) return numericIdOf(tree.worktreeFolder);
  }
  const [checkout] = trees;
  if (checkout === undefined) return null;
  return classifyChangePath(
    target,
    path.resolve(checkout.changesDir),
    path.resolve(checkout.archiveDir),
    path.resolve(checkout.rejectedDir),
  );
}

/**
 * Every path a hub watches: the configured OpenSpec root of the first tree,
 * then the change folder of each worktree tree. The result is de-duplicated so
 * overlapping trees never register the same path twice.
 */
export function treeWatchPaths(
  projectRoot: string,
  openspecRoot: string,
  trees: readonly ChangeTree[],
): string[] {
  const paths = [path.resolve(projectRoot, openspecRoot)];
  for (const tree of trees) {
    if (tree.worktreeFolder === undefined) continue;
    const folder = path.resolve(tree.changesDir, tree.worktreeFolder);
    if (!paths.includes(folder)) paths.push(folder);
  }
  return paths;
}
