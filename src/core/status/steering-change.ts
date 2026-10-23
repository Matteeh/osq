import fs from 'node:fs/promises';
import type { OsqConfig } from '../foundation/config.js';
import { parseFrontmatter } from '../spec/parser.js';
import { type LocatedChange, listChanges, matchesFolder } from './change-locations.js';
import { getRegressedMarkerPath } from './layout.js';
import { type SpecState, deriveSpecState, readChangeFolder } from './state.js';

/** One located change with the state derived in its own tree. */
export interface SteeringChange {
  readonly change: LocatedChange;
  readonly state: SpecState;
}

/** Derive a located change's state from the tree it lives in; writes nothing. */
async function readState(change: LocatedChange): Promise<SpecState> {
  return deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
}

/**
 * Every archived change in an osq worktree whose derived state has steering, in
 * numeric order, each with its derived state. Writes nothing.
 */
export async function listArchivedSteering(
  projectRoot: string,
  config: OsqConfig,
): Promise<SteeringChange[]> {
  const archived = await listChanges(projectRoot, config, ['archived']);
  const steered: SteeringChange[] = [];
  for (const change of archived) {
    if (change.tree.worktreeFolder === undefined) continue;
    const state = await readState(change);
    if ((state.steering?.length ?? 0) > 0) steered.push({ change, state });
  }
  return steered;
}

/** Whether the change folder's `.run/regressed/change.md` has reason `commit_failed`. */
export async function hasFailedArchiveCommit(folderPath: string): Promise<boolean> {
  const content = await fs
    .readFile(getRegressedMarkerPath(folderPath, 'change'), 'utf8')
    .catch(() => null);
  if (content === null) return false;
  return parseFrontmatter(content).data.reason === 'commit_failed';
}

/**
 * Every archived change in an osq worktree whose archive commit failed and that
 * needs no steering, in numeric order, each with its derived state. Writes
 * nothing.
 */
export async function listArchivedCommitFailed(
  projectRoot: string,
  config: OsqConfig,
): Promise<SteeringChange[]> {
  const archived = await listChanges(projectRoot, config, ['archived']);
  const failed: SteeringChange[] = [];
  for (const change of archived) {
    if (change.tree.worktreeFolder === undefined) continue;
    const state = await readState(change);
    if ((state.steering?.length ?? 0) > 0) continue;
    if (!(await hasFailedArchiveCommit(change.folderPath))) continue;
    failed.push({ change, state });
  }
  return failed;
}

/**
 * The active change `findChange` finds for the id; else the archived change in
 * an osq worktree that needs steering; else null. Writes nothing.
 */
export async function findSteeringChange(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
): Promise<SteeringChange | null> {
  const active = await listChanges(projectRoot, config, ['active']);
  const match = active.find((change) => matchesFolder(change.folderName, idOrPrefix));
  if (match !== undefined) {
    return { change: match, state: await readState(match) };
  }
  const archived = await listArchivedSteering(projectRoot, config);
  return archived.find((entry) => matchesFolder(entry.change.folderName, idOrPrefix)) ?? null;
}
