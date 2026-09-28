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
  assertCheckoutClean,
  assertGit,
  assertNoEarlierChange,
  assertVcsEnabled,
  assertWorktreeClean,
  runLandVerify,
} from './land-checks.js';
import { selectVcs } from './select.js';
import { syncWithDefaultBranch } from './sync-main.js';
import type { Vcs } from './vcs.js';
import { worktreeBranch, worktreePath } from './worktree.js';

/** The lines a land prints and the code it exits with. */
export interface LandResult {
  readonly lines: string[];
  readonly code: number;
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

/** The checkout HEAD, the checkout status, and the worktree HEAD all still line up. */
async function assertStillLandable(
  vcs: Vcs,
  defaultBranch: string,
  change: LocatedChange,
  worktree: string,
): Promise<void> {
  const [head, status, entries] = await Promise.all([vcs.head(), vcs.status(), vcs.worktreeList()]);
  const worktreeHead = entries.find(
    (entry) => path.resolve(entry.path) === path.resolve(worktree),
  )?.head;
  const clean = status.every((entry) => entry.code === '??');
  const ancestor =
    worktreeHead != null &&
    worktreeHead !== '' &&
    (await vcs.isAncestor(defaultBranch, worktreeHead));
  if (head.branch !== defaultBranch || !clean || !ancestor) {
    throw new Error(`${defaultBranch} moved while landing; run osq land ${landId(change)} again`);
  }
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
    return { lines: [`${folder} has already landed; nothing to clean up`], code: 0 };
  }
  return { lines: [`${folder} has already landed`, ...cleanup.lines], code: 0 };
}

/**
 * Land an archived change onto the default branch. Refuses unsafe state before
 * writing anything, syncs the default branch into the change's worktree and
 * verifies it, squash-merges into the checkout, commits, and cleans up. Every
 * refusal and stop is an `Error` with the message the spec names.
 */
export async function landChange(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
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
  assertCheckoutClean(await vcs.status());

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

  const sync = await syncWithDefaultBranch(projectRoot, config, change);
  if (!sync.merged) await runLandVerify(worktree, change, config);
  await assertStillLandable(vcs, defaultBranch, change, worktree);

  const squashed = await vcs.merge(worktreeBranch(change.folderName), true);
  if (squashed.status === 'conflict') {
    await vcs.mergeAbort().catch(() => undefined);
    throw new Error(`${defaultBranch} moved while landing; run osq land ${landId(change)} again`);
  }

  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');
  const { message } = await buildSquashMessage(projectRoot, config, idOrPrefix);
  let commit: string;
  try {
    commit = await vcs.commit([], message, author);
  } catch (error) {
    const output = error instanceof Error ? error.message : String(error);
    return {
      lines: [
        output,
        `The squash is staged. Finish with: osq message ${landId(change)} | git commit -F -`,
        'Or undo it with: git reset --merge',
      ],
      code: 1,
    };
  }

  const cleanup = await cleanupChange(projectRoot, config, vcs, change.folderName);
  return {
    lines: [
      `Landed ${change.folderName} as ${commit}`,
      ...cleanup.lines,
      `Kept branch ${worktreeBranch(change.folderName)}`,
    ],
    code: 0,
  };
}
