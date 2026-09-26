import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { hashChangeFolder } from '../spec/hasher.js';
import { selectVcs } from '../vcs/select.js';
import { changeTrees, changesDirLabel } from './change-locations.js';
import { isActiveChangeFolderName } from './layout.js';
import { compareNumericPrefix } from './state.js';

/**
 * A checkout copy of a change that already landed on the default branch. The
 * archive holds the approved contents, so the copy is stale and can be removed.
 */
export interface LeftoverDraft {
  readonly folderName: string;
  /** The copy's path relative to the project root, for the printed `rm -r`. */
  readonly path: string;
}

/** Active change folder names directly under `dir`, directories only. */
async function activeFolders(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && isActiveChangeFolderName(entry.name))
    .map((entry) => entry.name);
}

/**
 * The active folders in the project root's changes directory whose authored
 * contents still match the `.run/approved` the default branch holds for them.
 * With `vcs.enabled` off or git unavailable there are no leftovers and no read.
 */
export async function findLeftoverDrafts(
  projectRoot: string,
  config: OsqConfig,
): Promise<LeftoverDraft[]> {
  if (config.vcs?.enabled !== true) return [];
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return [];

  const [tree] = await changeTrees(projectRoot, config);
  const folders = await activeFolders(tree.changesDir);
  if (folders.length === 0) return [];

  const branch = await vcs.defaultBranch();
  const archive = path.relative(tree.root, tree.archiveDir).split(path.sep).join('/');
  const label = changesDirLabel(config);

  const leftovers: LeftoverDraft[] = [];
  for (const folderName of folders) {
    const landed = await vcs.show(branch, `${archive}/${folderName}/.run/approved`);
    if (landed === null || landed.trim() === '') continue;
    const current = await hashChangeFolder(path.join(tree.changesDir, folderName)).catch(
      () => null,
    );
    if (current === null || current !== landed.trim()) continue;
    leftovers.push({ folderName, path: `${label}/${folderName}` });
  }
  return leftovers.sort((a, b) => compareNumericPrefix(a.folderName, b.folderName));
}
