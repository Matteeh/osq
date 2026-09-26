import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
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

/**
 * The trees changes live in. Today there is exactly one, the project root; a
 * relative project root resolves against the current directory. The function is
 * async because the next stage adds `git worktree list` behind it.
 */
export async function changeTrees(projectRoot: string, config: OsqConfig): Promise<ChangeTree[]> {
  const root = path.resolve(projectRoot);
  return [
    {
      root,
      changesDir: getChangesDir(config.paths.openspecRoot, root),
      archiveDir: getArchiveDir(config.paths.openspecRoot, root),
      rejectedDir: getRejectedDir(config.paths.openspecRoot, root),
    },
  ];
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
  const changes: LocatedChange[] = [];
  for (const tree of trees) {
    if (wanted.has('active')) {
      changes.push(...(await listLocation(tree, tree.changesDir, 'active')));
    }
    if (wanted.has('archived')) {
      changes.push(...(await listLocation(tree, tree.archiveDir, 'archived')));
    }
    if (wanted.has('rejected')) {
      changes.push(...(await listLocation(tree, tree.rejectedDir, 'rejected')));
    }
  }
  return changes.sort(compareLocated);
}

/** Whether a folder name matches a query as `findSpecFolder` matches it. */
function matchesFolder(folderName: string, query: string): boolean {
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
