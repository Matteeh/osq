import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { readDependencyState } from '../spec/stack-dependencies.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs, VcsStatusEntry } from '../vcs/vcs.js';
import { changeTrees, listChanges } from './change-locations.js';

/** A change that archived but has not landed, and whether it archived in a worktree. */
export interface LandCandidate {
  /** The change folder name, such as `001-a`. */
  readonly folder: string;
  /** Absolute path of the archived folder. */
  readonly folderPath: string;
  /** True when the change archived in an osq worktree rather than the checkout. */
  readonly worktree: boolean;
}

/** Whether a status entry is untracked or modified at `rel` or under it. */
function touches(entry: VcsStatusEntry, rel: string): boolean {
  if (entry.code !== '??' && !entry.code.includes('M')) return false;
  const target = entry.path.replace(/\/+$/, '');
  return target === rel || target.startsWith(`${rel}/`);
}

/** Changes archived on an osq worktree branch the default branch does not hold. */
async function worktreeCandidates(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
): Promise<LandCandidate[]> {
  const archived = await listChanges(projectRoot, config, ['archived']);
  const candidates: LandCandidate[] = [];
  for (const change of archived) {
    if (change.tree.worktreeFolder === undefined) continue;
    const state = await readDependencyState(projectRoot, config, vcs, change.folderName);
    if (state.state !== 'archived') continue;
    candidates.push({
      folder: change.folderName,
      folderPath: change.folderPath,
      worktree: true,
    });
  }
  return candidates;
}

/** Archive folders the checkout's git status has not committed cleanly. */
async function checkoutCandidates(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
): Promise<LandCandidate[]> {
  const [tree] = await changeTrees(projectRoot, config);
  const entries = await fs.readdir(tree.archiveDir, { withFileTypes: true }).catch(() => []);
  const folders = entries
    .filter(
      (entry) => entry.isDirectory() && !entry.name.startsWith('_') && !entry.name.startsWith('.'),
    )
    .map((entry) => entry.name);
  if (folders.length === 0) return [];

  const status = await vcs.status();
  const relArchive = path.relative(tree.root, tree.archiveDir).split(path.sep).join('/');
  const candidates: LandCandidate[] = [];
  for (const folder of folders) {
    const rel = relArchive === '' ? folder : `${relArchive}/${folder}`;
    if (!status.some((entry) => touches(entry, rel))) continue;
    candidates.push({ folder, folderPath: path.join(tree.archiveDir, folder), worktree: false });
  }
  return candidates;
}

/**
 * Every change that archived but has not landed. With `vcs.enabled`, a change
 * archived on an osq worktree branch counts until the default branch holds it.
 * Without the flag, an archive folder counts while git status leaves it
 * untracked or modified. Under `NoVcs` nothing counts.
 */
export async function findLandCandidates(
  projectRoot: string,
  config: OsqConfig,
): Promise<LandCandidate[]> {
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return [];
  if (config.vcs?.enabled === true) return worktreeCandidates(projectRoot, config, vcs);
  return checkoutCandidates(projectRoot, config, vcs);
}
