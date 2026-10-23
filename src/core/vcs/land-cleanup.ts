import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { listChanges } from '../status/change-locations.js';
import { retryAfterLand } from './land-after.js';
import type { LandOptions, LandResult } from './land.js';
import type { Vcs } from './vcs.js';
import { worktreePath } from './worktree.js';

/** What one worktree cleanup attempted, printed, and whether it failed. */
export interface CleanupResult {
  /** The lines the cleanup prints; empty when nothing was there to remove. */
  readonly lines: readonly string[];
  /** Whether a folder was there or git listed the worktree. */
  readonly attempted: boolean;
  /** Whether a step failed, so the land exits 1. */
  readonly failed: boolean;
}

/** The checkout's archived folder for `folder`, or null when it is absent. */
async function checkoutArchive(
  projectRoot: string,
  config: OsqConfig,
  folder: string,
): Promise<string | null> {
  const root = path.resolve(projectRoot);
  const archived = await listChanges(projectRoot, config, ['archived']);
  const found = archived.find(
    (change) => change.folderName === folder && path.resolve(change.tree.root) === root,
  );
  return found?.folderPath ?? null;
}

/** The worktree's log folder and its checkout destination, or null when it has none. */
async function worktreeLogs(
  projectRoot: string,
  config: OsqConfig,
  folder: string,
  target: string,
): Promise<{ source: string; destination: string } | null> {
  const archive = await checkoutArchive(projectRoot, config, folder);
  if (archive === null) return null;
  const relative = path.relative(path.resolve(projectRoot), archive);
  const source = path.join(target, relative, '.run', 'logs');
  const stat = await fs.stat(source).catch(() => null);
  if (stat?.isDirectory() !== true) return null;
  return { source, destination: path.join(archive, '.run', 'logs') };
}

/**
 * Copy the change's verify logs from its worktree into the checkout, delete the
 * whole worktree folder with its ignored files, then prune git's records, in
 * that order. A failed step stops the rest and reports its message.
 *
 * @scenario version-control: Ignored build output removed
 * @scenario version-control: Logs kept in the checkout
 * @scenario version-control: Removal fails after the land commit
 * @scenario version-control: Leftover folder removed on the next land
 * @adr 003
 */
export async function cleanupChange(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folder: string,
): Promise<CleanupResult> {
  if (config.vcs === undefined) return { lines: [], attempted: false, failed: false };
  const repoRoot = (await vcs.root()) ?? projectRoot;
  const target = worktreePath(config.vcs, repoRoot, folder);
  const present = (await fs.stat(target).catch(() => null))?.isDirectory() === true;
  const listed = (await vcs.worktreeList()).some(
    (entry) => path.resolve(entry.path) === path.resolve(target),
  );
  if (!present && !listed) return { lines: [], attempted: false, failed: false };

  try {
    const logs = await worktreeLogs(projectRoot, config, folder, target);
    if (logs !== null) {
      await fs.cp(logs.source, logs.destination, { recursive: true, force: false });
    }
    await fs.rm(target, { recursive: true, force: true });
    await vcs.worktreePrune();
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    return {
      lines: [`Could not remove worktree ${target}: ${cause}`],
      attempted: true,
      failed: true,
    };
  }
  return { lines: [`Removed worktree ${target}`], attempted: true, failed: false };
}

/**
 * Retry a recorded after-land failure, then clean up a change the default
 * branch already holds, reporting whether a cleanup step failed.
 *
 * @scenario version-control: Landed by hand, worktree kept
 * @scenario version-control: Nothing to clean up
 * @scenario version-control: Leftover folder removed on the next land
 * @adr 003
 */
export async function cleanupLanded(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  change: { readonly folderName: string },
  progress: (line: string) => void,
  options: LandOptions,
): Promise<LandResult> {
  const after = await retryAfterLand(projectRoot, config, change, progress, options.home);
  const cleanup = await cleanupChange(projectRoot, config, vcs, change.folderName);
  const already = cleanup.attempted
    ? [`${change.folderName} has already landed`, ...cleanup.lines]
    : [`${change.folderName} has already landed; nothing to clean up`];
  return {
    lines: [...(after?.lines ?? []), ...already],
    code: cleanup.failed ? 1 : (after?.code ?? 0),
    changed: [],
    ...(after !== null ? { afterLand: after.outcome } : {}),
  };
}
