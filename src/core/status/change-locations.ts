import fs from 'node:fs/promises';
import path from 'node:path';
import type { VcsConfig } from '../foundation/config-vcs.js';
import type { OsqConfig } from '../foundation/config.js';
import { selectVcs } from '../vcs/select.js';
import { stackedPath } from '../vcs/worktree.js';
import { filterLandedCopies } from './landed-copies.js';
import {
  getArchiveDir,
  getChangesDir,
  getRejectedDir,
  isActiveChangeFolderName,
} from './layout.js';
import { compareNumericPrefix } from './state.js';

/** Where a change folder currently lives. */
export type ChangeLocation = 'active' | 'archived' | 'rejected';

/** One tree changes live in, with its canonical change directories. */
export interface ChangeTree {
  /** Absolute project root of the tree. */
  readonly root: string;
  /** For an osq worktree tree, the change folder it checks out. */
  readonly worktreeFolder?: string;
  /** For a stacked approval tree, the change folder it holds. */
  readonly stackedFolder?: string;
  readonly changesDir: string;
  readonly archiveDir: string;
  readonly rejectedDir: string;
}

/** One change folder with its location and the tree it lives in. */
export interface LocatedChange {
  readonly folderName: string;
  /** Absolute path of the folder. */
  readonly folderPath: string;
  readonly location: ChangeLocation;
  readonly tree: ChangeTree;
}

const LOCATION_ORDER: readonly ChangeLocation[] = ['active', 'archived', 'rejected'];

/** Order two located changes by location, then numeric prefix. */
function compareLocated(a: LocatedChange, b: LocatedChange): number {
  const rank = LOCATION_ORDER.indexOf(a.location) - LOCATION_ORDER.indexOf(b.location);
  if (rank !== 0) return rank;
  return compareNumericPrefix(a.folderName, b.folderName);
}

/** Whether a change-location directory entry is a change folder candidate. */
function isLocationEntry(entry: string, location: ChangeLocation): boolean {
  if (location === 'active') return isActiveChangeFolderName(entry);
  return !entry.startsWith('_') && !entry.startsWith('.');
}

/** Every change folder directly under one canonical directory. */
async function listLocation(
  tree: ChangeTree,
  dir: string,
  location: ChangeLocation,
): Promise<LocatedChange[]> {
  const entries = await fs.readdir(dir).catch(() => []);
  const changes: LocatedChange[] = [];
  for (const entry of entries) {
    if (!isLocationEntry(entry, location)) continue;
    const folderPath = path.join(dir, entry);
    const stat = await fs.stat(folderPath).catch(() => null);
    if (!stat?.isDirectory()) continue;
    changes.push({ folderName: entry, folderPath, location, tree });
  }
  return changes;
}

/** One tree rooted at `root`, its canonical directories from the config. */
function treeAt(
  root: string,
  config: OsqConfig,
  refs: { worktreeFolder?: string; stackedFolder?: string } = {},
): ChangeTree {
  return {
    root,
    ...(refs.worktreeFolder !== undefined ? { worktreeFolder: refs.worktreeFolder } : {}),
    ...(refs.stackedFolder !== undefined ? { stackedFolder: refs.stackedFolder } : {}),
    changesDir: getChangesDir(config.paths.openspecRoot, root),
    archiveDir: getArchiveDir(config.paths.openspecRoot, root),
    rejectedDir: getRejectedDir(config.paths.openspecRoot, root),
  };
}

/** The `.stacked` directory holding one stacked approval per change folder. */
function stackedRoot(vcs: VcsConfig, repoRoot: string): string {
  return path.dirname(stackedPath(vcs, repoRoot, 'folder'));
}

/**
 * Whether a worktree holds `folder`: an approved copy in its changes
 * directory, or the folder in its archive or rejected directory. Checks the
 * three paths in that order and stops at the first that exists.
 */
async function holdsChange(tree: ChangeTree, folder: string): Promise<boolean> {
  const candidates = [
    path.join(tree.changesDir, folder, '.run', 'approved'),
    path.join(tree.archiveDir, folder),
    path.join(tree.rejectedDir, folder),
  ];
  for (const candidate of candidates) {
    if (await fs.stat(candidate).catch(() => null)) return true;
  }
  return false;
}

/** Resolve a path with symlinks, falling back to the raw path when absent. */
async function realpath(target: string): Promise<string> {
  return fs.realpath(target).catch(() => target);
}

/**
 * The trees changes live in. The first is always the project root; with
 * `vcs.enabled` and git selected, one tree follows per osq worktree, carrying
 * the change folder its branch names. A relative project root resolves against
 * the current directory.
 */
export async function changeTrees(projectRoot: string, config: OsqConfig): Promise<ChangeTree[]> {
  const root = path.resolve(projectRoot);
  const trees: ChangeTree[] = [treeAt(root, config)];
  if (config.vcs?.enabled !== true) return trees;

  const vcs = await selectVcs(root, config);
  if (vcs.kind !== 'git') return trees;

  const rootReal = await realpath(root);
  const namedByWorktree = new Set<string>();
  for (const worktree of await vcs.worktreeList()) {
    const branch = worktree.branch;
    if (!branch?.startsWith('osq/')) continue;
    if ((await realpath(worktree.path)) === rootReal) continue;
    const folder = branch.slice('osq/'.length);
    const tree = treeAt(worktree.path, config, { worktreeFolder: folder });
    if (!(await holdsChange(tree, folder))) continue;
    namedByWorktree.add(folder);
    trees.push(tree);
  }

  const repoRoot = (await vcs.root()) ?? root;
  const rootDir = stackedRoot(config.vcs, repoRoot);
  const entries = await fs.readdir(rootDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (namedByWorktree.has(entry.name)) continue;
    trees.push(treeAt(path.join(rootDir, entry.name), config, { stackedFolder: entry.name }));
  }
  return trees;
}

/**
 * Every change folder across every tree, directories only, active first, then
 * archived, then rejected, each in numeric prefix order.
 */
export async function listChanges(
  projectRoot: string,
  config: OsqConfig,
  locations: readonly ChangeLocation[] = LOCATION_ORDER,
): Promise<LocatedChange[]> {
  const wanted = new Set(locations);
  const trees = await changeTrees(projectRoot, config);
  const namedFolders = new Set(
    trees.flatMap((tree) => {
      const folder = tree.worktreeFolder ?? tree.stackedFolder;
      return folder === undefined ? [] : [folder];
    }),
  );
  const changes: LocatedChange[] = [];
  for (const tree of trees) {
    const entries: LocatedChange[] = [];
    if (wanted.has('active')) {
      entries.push(...(await listLocation(tree, tree.changesDir, 'active')));
    }
    if (wanted.has('archived')) {
      entries.push(...(await listLocation(tree, tree.archiveDir, 'archived')));
    }
    if (wanted.has('rejected')) {
      entries.push(...(await listLocation(tree, tree.rejectedDir, 'rejected')));
    }
    // A worktree or stacked tree contributes only the folder it names; the
    // project root drops an active folder any such tree names.
    const namedFolder = tree.worktreeFolder ?? tree.stackedFolder;
    if (namedFolder !== undefined) {
      const own = entries.filter((entry) => entry.folderName === namedFolder);
      changes.push(...(await filterLandedCopies(trees[0] as ChangeTree, own)));
    } else {
      changes.push(
        ...entries.filter(
          (entry) => entry.location !== 'active' || !namedFolders.has(entry.folderName),
        ),
      );
    }
  }
  return changes.sort(compareLocated);
}

/** Whether a folder name matches a query as `findSpecFolder` matches it. */
export function matchesFolder(folderName: string, query: string): boolean {
  const trimmed = query.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;

  return (
    folderName === trimmed ||
    folderName === padded ||
    folderName.startsWith(`${trimmed}-`) ||
    folderName.startsWith(`${padded}-`)
  );
}

/**
 * The active change matching an exact name, a number with or without zero
 * padding, or that number followed by `-`. Fails with `findSpecFolder`'s
 * message when nothing matches.
 */
export async function findChange(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
): Promise<LocatedChange> {
  const active = await listChanges(projectRoot, config, ['active']);
  const match = active.find((change) => matchesFolder(change.folderName, idOrPrefix));
  if (match) return match;

  const [tree] = await changeTrees(projectRoot, config);
  throw new Error(`Spec "${idOrPrefix}" not found in ${tree.changesDir}`);
}

/** The change an absolute folder path names, or null when no tree holds it. */
export async function locateFolder(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
): Promise<LocatedChange | null> {
  const target = path.resolve(projectRoot, folderPath);
  const changes = await listChanges(projectRoot, config);
  return changes.find((change) => change.folderPath === target) ?? null;
}

/** The changes directory relative to the project root, for display. */
export function changesDirLabel(config: OsqConfig): string {
  return getChangesDir(config.paths.openspecRoot);
}
