import fs from 'node:fs/promises';
import path from 'node:path';
import type { VcsConfig } from '../foundation/config-vcs.js';
import type { OsqConfig } from '../foundation/config.js';
import { buildSquashMessage } from '../run/squash-message.js';
import { readDependencyState } from '../spec/stack-dependencies.js';
import { type LocatedChange, listChanges, matchesFolder } from '../status/change-locations.js';
import { findLeftoverDrafts } from '../status/leftover-drafts.js';
import {
  OSQ_LAND_NEEDS_GIT,
  assertCheckoutBranch,
  assertGit,
  assertNoEarlierChange,
  assertVcsEnabled,
  assertWorktreeClean,
} from './land-checks.js';
import { selectVcs } from './select.js';
import { syncWithDefaultBranch } from './sync-main.js';
import type { Vcs, VcsFastForwardResult } from './vcs.js';
import { worktreeBranch, worktreePath } from './worktree.js';

/** The lines a land prints, the code it exits with, and the absolute paths it changed. */
export interface LandResult {
  readonly lines: string[];
  readonly code: number;
  readonly changed: readonly string[];
}

/** The numeric id of a change folder, for the messages a land repeats. */
function landId(change: LocatedChange): string {
  return change.folderName.split('-')[0] ?? change.folderName;
}

/** Select the git backend a land needs, refusing the two ways it is off. */
async function requireGit(projectRoot: string, config: OsqConfig): Promise<Vcs> {
  assertVcsEnabled(config);
  const vcs = await selectVcs(projectRoot, config);
  assertGit(vcs);
  return vcs;
}

/** The best matching change: an archived worktree copy wins over any other. */
async function resolveChange(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
): Promise<LocatedChange | null> {
  const matches = (await listChanges(projectRoot, config)).filter((change) =>
    matchesFolder(change.folderName, idOrPrefix),
  );
  return (
    matches.find(
      (change) => change.location === 'archived' && change.tree.worktreeFolder !== undefined,
    ) ??
    matches.find((change) => change.location === 'archived') ??
    matches[0] ??
    null
  );
}

/** The absolute worktree of `change`, when git lists one. */
async function resolveWorktree(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  change: LocatedChange,
): Promise<string | null> {
  if (change.tree.worktreeFolder !== undefined) return change.tree.root;
  if (config.vcs === undefined) return null;
  const repoRoot = (await vcs.root()) ?? projectRoot;
  const target = worktreePath(config.vcs, repoRoot, change.folderName);
  const listed = (await vcs.worktreeList()).some(
    (entry) => path.resolve(entry.path) === path.resolve(target),
  );
  return listed ? target : null;
}

/** Remove the leftover draft and the worktree, reporting each attempt. */
async function cleanupChange(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folder: string,
): Promise<{ lines: string[]; removed: boolean }> {
  const lines: string[] = [];
  let removed = false;
  const draft = (await findLeftoverDrafts(projectRoot, config)).find(
    (entry) => entry.folderName === folder,
  );
  if (draft !== undefined) {
    await fs.rm(path.join(projectRoot, draft.path), { recursive: true, force: true });
    lines.push(`Removed leftover draft ${draft.path}`);
    removed = true;
  }
  if (config.vcs === undefined) return { lines, removed };

  const repoRoot = (await vcs.root()) ?? projectRoot;
  const target = worktreePath(config.vcs as VcsConfig, repoRoot, folder);
  const listed = (await vcs.worktreeList()).some(
    (entry) => path.resolve(entry.path) === path.resolve(target),
  );
  if (!listed) return { lines, removed };
  try {
    await vcs.worktreeRemove(target);
    lines.push(`Removed worktree ${target}`);
  } catch (error) {
    lines.push(`Kept worktree ${target}:`);
    lines.push(error instanceof Error ? error.message : String(error));
  }
  return { lines, removed: true };
}

/** The two cleanup outcomes for a change the default branch already holds. */
async function cleanupLanded(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folder: string,
): Promise<LandResult> {
  const cleanup = await cleanupChange(projectRoot, config, vcs, folder);
  if (!cleanup.removed) {
    return { lines: [`${folder} has already landed; nothing to clean up`], code: 0, changed: [] };
  }
  return { lines: [`${folder} has already landed`, ...cleanup.lines], code: 0, changed: [] };
}

/**
 * Build the land commit from the branch tip and move the checkout to it with a
 * fast-forward only. A failed move stops naming the checkout's overlap, a
 * checkout that moved, or git's output.
 */
async function landCommit(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  change: LocatedChange,
  defaultBranch: string,
  base: string,
  tip: string,
  idOrPrefix: string,
): Promise<{ commit: string; changed: readonly string[] }> {
  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');
  const { message } = await buildSquashMessage(projectRoot, config, idOrPrefix);
  const commit = await vcs.commitTree(tip, base, message, author);

  let pushed: VcsFastForwardResult;
  try {
    pushed = await vcs.fastForward(commit);
  } catch (error) {
    if ((await vcs.head()).sha !== base) {
      throw new Error(`${defaultBranch} moved while landing; run osq land ${landId(change)} again`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (pushed.status === 'blocked') {
    throw new Error(
      `The checkout has uncommitted changes in files this land writes: ${pushed.blocked.join(', ')}; commit or stash them, then run osq land ${landId(change)} again`,
    );
  }
  return { commit, changed: pushed.changed ?? [] };
}

/**
 * Land an archived change onto the default branch. Refuses unsafe state before
 * writing anything, syncs the default branch into the change's worktree, builds
 * the land commit from the branch tip, fast-forwards the checkout to it, and
 * cleans up. Every refusal and stop is an `Error` with the message the spec
 * names.
 */
export async function landChange(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
  progress: (line: string) => void = () => {},
): Promise<LandResult> {
  const vcs = await requireGit(projectRoot, config);
  const change = await resolveChange(projectRoot, config, idOrPrefix);
  const alreadyLanded =
    change !== null &&
    (await readDependencyState(projectRoot, config, vcs, change.folderName)).state === 'landed';

  if (!alreadyLanded) {
    await buildSquashMessage(projectRoot, config, idOrPrefix);
  }
  if (change === null) {
    throw new Error(`No archived change "${idOrPrefix}" in an osq worktree`);
  }

  const defaultBranch = await vcs.defaultBranch();
  assertCheckoutBranch(await vcs.head(), defaultBranch);

  const worktree = await resolveWorktree(projectRoot, config, vcs, change);
  if (worktree !== null) {
    const worktreeVcs = await selectVcs(worktree, config);
    assertWorktreeClean(worktree, await worktreeVcs.status());
  }
  if (!alreadyLanded) {
    await assertNoEarlierChange(projectRoot, config, change);
  }
  if (alreadyLanded) {
    return cleanupLanded(projectRoot, config, vcs, change.folderName);
  }
  if (worktree === null) throw new Error(OSQ_LAND_NEEDS_GIT);

  await syncWithDefaultBranch(projectRoot, config, change, progress);

  const worktreeVcs = await selectVcs(worktree, config);
  const tip = (await worktreeVcs.head()).sha;
  const base = (await vcs.head()).sha;
  if (base === null || tip === null || !(await vcs.isAncestor(base, tip))) {
    throw new Error(`${defaultBranch} moved while landing; run osq land ${landId(change)} again`);
  }

  const { commit, changed } = await landCommit(
    projectRoot,
    config,
    vcs,
    change,
    defaultBranch,
    base,
    tip,
    idOrPrefix,
  );
  const repoRoot = (await vcs.root()) ?? projectRoot;
  const cleanup = await cleanupChange(projectRoot, config, vcs, change.folderName);
  return {
    lines: [
      `Landed ${change.folderName} as ${commit}`,
      ...cleanup.lines,
      `Kept branch ${worktreeBranch(change.folderName)}`,
    ],
    code: 0,
    changed: changed.map((entry) => path.join(repoRoot, entry)),
  };
}
