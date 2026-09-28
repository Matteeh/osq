import type { OsqConfig } from '../foundation/config.js';
import { runVerificationCommand } from '../run/verification.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import type { LocatedChange } from '../status/change-locations.js';
import { findLandCandidates } from '../status/dispatch-land.js';
import { readLandedAt } from '../web/web-data-lifecycle.js';
import { listDeltaCapabilities } from './sync-specs.js';
import type { Vcs, VcsHead, VcsStatusEntry } from './vcs.js';
import { worktreeBranch } from './worktree.js';

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

/** Refuse when the checkout tracks any change other than an untracked entry. */
export function assertCheckoutClean(status: readonly VcsStatusEntry[]): void {
  const dirty = status.filter((entry) => entry.code !== '??').map((entry) => entry.path);
  if (dirty.length === 0) return;
  throw new Error(
    `The checkout has uncommitted changes: ${dirty.join(', ')}; commit or stash them first`,
  );
}

/** Refuse when the change's worktree has any entry in its status. */
export function assertWorktreeClean(worktree: string, status: readonly VcsStatusEntry[]): void {
  if (status.length === 0) return;
  const paths = status.map((entry) => entry.path).join(', ');
  throw new Error(`${worktree} has uncommitted changes: ${paths}; commit or discard them first`);
}

/**
 * Run the proposal's verify in the worktree, stopping red with its output tail.
 */
export async function runLandVerify(
  worktree: string,
  change: LocatedChange,
  config: OsqConfig,
): Promise<void> {
  const proposal = await parseSpecMdFromFolder(change.folderPath).catch(() => null);
  const command = proposal?.verify ?? '';
  if (command === '') return;
  const result = await runVerificationCommand(
    worktree,
    command,
    config.timeouts.verifyTimeoutSeconds,
    null,
  );
  if (result.exitCode === 0) return;
  const tail = outputTail(result.output, config.limits.cardOutputLines);
  throw new Error(
    `${change.folderName}: verify failed on ${worktreeBranch(change.folderName)}:\n${tail}`,
  );
}

/** The last `limit` non-blank lines of command output. */
function outputTail(output: string, limit: number): string {
  const lines = output.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - limit)).join('\n');
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
