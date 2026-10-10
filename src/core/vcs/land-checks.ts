import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { parseStackedOn } from '../spec/stack-dependencies.js';
import type { LocatedChange } from '../status/change-locations.js';
import { type LandCandidate, findLandCandidates } from '../status/dispatch-land.js';
import { deriveSpecState } from '../status/state.js';
import { describeTrigger } from '../status/steering.js';
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
 * Refuse a change whose derived state in its own worktree has a steering
 * trigger, naming the first one.
 */
export async function assertNoSteering(change: LocatedChange): Promise<void> {
  const state = await deriveSpecState(change.tree.root, change.folderPath);
  const first = state.steering?.[0];
  if (first === undefined) return;
  const id = change.folderName.split('-')[0] ?? change.folderName;
  throw new Error(
    `${change.folderName} needs steering: ${describeTrigger(first)}; run osq plan ${id}`,
  );
}

/** The folder names one candidate's archived `.run/stacked-on` names. */
async function stackedOnNames(candidate: LandCandidate): Promise<string[]> {
  const target = path.join(candidate.folderPath, '.run', 'stacked-on');
  const content = await fs.readFile(target, 'utf8').catch(() => null);
  if (content === null) return [];
  return parseStackedOn(content).map((entry) => entry.folder);
}

/** Every candidate stacked on `folder`, directly or through other candidates. */
async function stackedOn(
  folder: string,
  candidates: readonly LandCandidate[],
): Promise<Set<string>> {
  const dependents = new Map<string, string[]>();
  for (const candidate of candidates) {
    for (const base of await stackedOnNames(candidate)) {
      dependents.set(base, [...(dependents.get(base) ?? []), candidate.folder]);
    }
  }
  const stacked = new Set<string>();
  const queue = [folder];
  for (let current = queue.pop(); current !== undefined; current = queue.pop()) {
    for (const dependent of dependents.get(current) ?? []) {
      if (stacked.has(dependent)) continue;
      stacked.add(dependent);
      queue.push(dependent);
    }
  }
  return stacked;
}

/**
 * Refuse when another change archived in an osq worktree, has not landed, and
 * has an earlier `archived` event than `change` while writing a delta for a
 * capability `change` also writes. A change with no `archived` event is never
 * compared. A change stacked on `change`, directly or through other
 * candidates, is not compared either.
 *
 * @scenario version-control: Earlier change shares a capability
 * @scenario version-control: Earlier change stacked on this one
 * @scenario version-control: Earlier change stacked through another
 * @adr 003
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

  const candidates = (await findLandCandidates(projectRoot, config)).filter(
    (candidate) => candidate.worktree,
  );
  const stacked = await stackedOn(change.folderName, candidates);

  for (const other of candidates) {
    if (other.folder === change.folderName || stacked.has(other.folder)) continue;
    const theirs = await readLandedAt(other.folderPath);
    if (theirs === null || theirs >= mine) continue;
    const shared = (await listDeltaCapabilities(other.folderPath)).filter((capability) =>
      capabilities.has(capability),
    );
    if (shared.length === 0) continue;
    throw new Error(
      `${other.folder} archived before ${change.folderName} and also writes ${shared.join(', ')}; land it first`,
    );
  }
}
