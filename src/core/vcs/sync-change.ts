import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { awaitedDependencies } from '../spec/stack-dependencies.js';
import { type LocatedChange, listChanges, matchesFolder } from '../status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import { selectVcs } from './select.js';
import { syncWithDefaultBranch } from './sync-main.js';
import { SyncStop } from './sync-stop.js';
import type { Vcs, VcsStatusEntry } from './vcs.js';
import { worktreeBranch } from './worktree.js';

/** The refusal every sync makes when version control is off. */
export const OSQ_SYNC_NEEDS_GIT = 'osq sync needs vcs.enabled and git';

/** A thrown value's message. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The best matching change: an archived worktree copy wins, as a land does. */
async function resolveChange(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
): Promise<LocatedChange | null> {
  const matches = (await listChanges(projectRoot, config, ['active', 'archived'])).filter(
    (change) => matchesFolder(change.folderName, idOrPrefix),
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

/** A change folder path as a worktree-root-relative POSIX path. */
function relativeChange(root: string, folderPath: string): string {
  return path.relative(root, folderPath).split(path.sep).join('/');
}

/** The only uncommitted paths a sync tolerates: its `.run/` and `tasks.md`. */
function allowedWorktreePath(candidate: string, changeRel: string): boolean {
  return candidate === `${changeRel}/tasks.md` || candidate.startsWith(`${changeRel}/.run/`);
}

/** Every status path outside the change folder's `.run/` and `tasks.md`, sorted. */
function worktreeDirt(entries: readonly VcsStatusEntry[], changeRel: string): string[] {
  const dirt = new Set<string>();
  for (const entry of entries) {
    for (const candidate of [entry.path, entry.from]) {
      if (candidate === undefined) continue;
      if (!allowedWorktreePath(candidate, changeRel)) dirt.add(candidate);
    }
  }
  return [...dirt].sort();
}

/** Append the `sync_stopped` event to the change folder's change stream. */
async function appendSyncStopped(
  folderPath: string,
  reason: string,
  message: string,
  defaultBranch: string,
): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = {
    type: 'sync_stopped',
    timestamp: new Date().toISOString(),
    data: { reason, message, defaultBranch },
  };
  await fs.appendFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

/** Refuse every precondition in the order "Sync on request" names. */
async function refuseSync(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  id: string,
  change: LocatedChange,
): Promise<void> {
  const state = deriveSpecState(await readChangeFolder(projectRoot, change.folderPath));
  if (state.tasks.some((task) => task.status === 'running')) {
    throw new Error(`${change.folderName} has a task running; run osq sync ${id} after it ends`);
  }
  const awaited = await awaitedDependencies(projectRoot, config, vcs, change.folderPath);
  if (awaited.length > 0) {
    const folders = awaited.map((entry) => entry.folder).join(', ');
    throw new Error(
      `${change.folderName} is stacked on ${folders}, which has not landed; land it first`,
    );
  }
  const worktreeVcs = await selectVcs(change.tree.root, config);
  const changeRel = relativeChange(change.tree.root, change.folderPath);
  const dirt = worktreeDirt(await worktreeVcs.status(), changeRel);
  if (dirt.length > 0) {
    throw new Error(
      `${change.tree.root} has uncommitted changes: ${dirt.join(', ')}; commit or discard them first`,
    );
  }
}

/**
 * Take the default branch into a change's branch on request. Refuses while a
 * task runs, a dependency has not landed, or the worktree is dirty; otherwise
 * runs the sync and reports whether it merged. A stop of an active change is
 * recorded as a `sync_stopped` event and never halts anything.
 */
export async function syncChange(
  projectRoot: string,
  config: OsqConfig,
  id: string,
  progress?: (line: string) => void,
): Promise<string> {
  if (config.vcs?.enabled !== true) throw new Error(OSQ_SYNC_NEEDS_GIT);
  const rootVcs = await selectVcs(projectRoot, config);
  if (rootVcs.kind !== 'git') throw new Error(OSQ_SYNC_NEEDS_GIT);

  const change = await resolveChange(projectRoot, config, id);
  if (change === null) throw new Error(`No change "${id}" runs in an osq worktree`);

  await refuseSync(projectRoot, config, rootVcs, id, change);

  const defaultBranch = await (await selectVcs(change.tree.root, config)).defaultBranch();
  try {
    const { merged } = await syncWithDefaultBranch(projectRoot, config, change, progress);
    return merged
      ? `Synced ${worktreeBranch(change.folderName)} with ${defaultBranch}`
      : `${worktreeBranch(change.folderName)} already has ${defaultBranch}`;
  } catch (error) {
    if (change.location === 'active') {
      const reason = error instanceof SyncStop ? error.reason : 'sync_failed';
      await appendSyncStopped(change.folderPath, reason, errorMessage(error), defaultBranch);
    }
    throw error instanceof Error ? error : new Error(errorMessage(error));
  }
}
