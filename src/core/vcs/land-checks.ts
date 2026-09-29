import type { OsqConfig } from '../foundation/config.js';
import type { LocatedChange } from '../status/change-locations.js';
import { findLandCandidates } from '../status/dispatch-land.js';
import { readLandedAt } from '../web/web-data-lifecycle.js';
import { listDeltaCapabilities } from './sync-specs.js';
import type { Vcs, VcsHead, VcsStatusEntry } from './vcs.js';

/** The refusal every land makes when version control is off. */
export const OSQ_LAND_NEEDS_GIT = 'osq land needs vcs.enabled and git';

/** Refuse when `vcs.enabled` is off. Selected before anything else. */
export function assertVcsEnabled(config: OsqConfig): void {
  if (config.vcs?.enabled !== true) throw new Error(OSQ_LAND_NEEDS_GIT);
}

/** Refuse when git is not the selected backend. */
export function assertGit(vcs: Vcs): void {
  if (vcs.kind !== 'git') throw new Error(OSQ_LAND_NEEDS_GIT);
}

/** Refuse when the checkout's HEAD is not exactly the default branch. */
export function assertCheckoutBranch(head: VcsHead, defaultBranch: string): void {
  if (head.branch === defaultBranch) return;
  const where = head.branch ?? 'a detached HEAD';
  throw new Error(`osq land runs on ${defaultBranch}; the checkout is on ${where}`);
}

/** Refuse when the change's worktree has any entry in its status. */
export function assertWorktreeClean(worktree: string, status: readonly VcsStatusEntry[]): void {
  if (status.length === 0) return;
  const paths = status.map((entry) => entry.path).join(', ');
  throw new Error(`${worktree} has uncommitted changes: ${paths}; commit or discard them first`);
}

/**
 * Refuse when another change archived in an osq worktree, has not landed, and
 * has an earlier `archived` event than `change` while writing a delta for a
 * capability `change` also writes. A change with no `archived` event is never
 * compared.
 */
export async function assertNoEarlierChange(
  projectRoot: string,
  config: OsqConfig,
  change: LocatedChange,
): Promise<void> {
  const mine = await readLandedAt(change.folderPath);
  if (mine === null) return;
  const capabilities = new Set(await listDeltaCapabilities(change.folderPath));
  if (capabilities.size === 0) return;

  for (const other of await findLandCandidates(projectRoot, config)) {
    if (other.folder === change.folderName || !other.worktree) continue;
    const theirs = await readLandedAt(other.folderPath);
    if (theirs === null || theirs >= mine) continue;
    const shared = (await listDeltaCapabilities(other.folderPath)).filter((capability) =>
      capabilities.has(capability),
    );
    if (shared.length === 0) continue;
    throw new Error(
      `${other.folder} archived before ${change.folderName} and also writes ${shared.join(', ')}; land it first, or reject it`,
    );
  }
}
