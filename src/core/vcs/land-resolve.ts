import type { OsqConfig } from '../foundation/config.js';
import { type LocatedChange, listChanges, matchesFolder } from '../status/change-locations.js';
import { assertGit, assertVcsEnabled } from './land-checks.js';
import { selectVcs } from './select.js';
import type { Vcs } from './vcs.js';

/**
 * The numeric id of a change folder, for the messages a land repeats.
 *
 * @scenario version-control: Origin moved while landing
 * @scenario version-control: Diverged branches
 * @adr 003
 */
export function landId(change: LocatedChange): string {
  return change.folderName.split('-')[0] ?? change.folderName;
}

/**
 * Select the git backend a land needs, refusing the two ways it is off.
 *
 * @scenario version-control: Land pushes the land commit
 * @adr 003
 */
export async function requireGit(projectRoot: string, config: OsqConfig): Promise<Vcs> {
  assertVcsEnabled(config);
  const vcs = await selectVcs(projectRoot, config);
  assertGit(vcs);
  return vcs;
}

/**
 * The best matching change: an archived worktree copy wins over any other.
 *
 * @scenario version-control: Land publishes to origin
 * @adr 003
 */
export async function resolveChange(
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
