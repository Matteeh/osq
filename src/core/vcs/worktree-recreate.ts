import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { runPrepare } from '../spec/approve-worktree.js';
import { changesDirLabel } from '../status/change-locations.js';
import { selectVcs } from './select.js';
import { worktreeBranch, worktreePath } from './worktree.js';

/** Whether `target` is a directory that exists. */
async function directoryExists(target: string): Promise<boolean> {
  const stat = await fs.stat(target).catch(() => null);
  return stat?.isDirectory() === true;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Recreate the worktree of every `osq/` branch whose directory is missing and
 * whose tip still holds the change's approval seal. Prunes stale worktree
 * records once, then adds, prepares, and reports each recreation. Never throws
 * for one branch: a failure becomes a line and the rest are still recreated.
 * Does nothing when git is disabled or unavailable.
 */
export async function recreateWorktrees(projectRoot: string, config: OsqConfig): Promise<string[]> {
  const vcsConfig = config.vcs;
  if (vcsConfig?.enabled !== true) return [];
  const vcs = await selectVcs(projectRoot, config);
  if (vcs.kind !== 'git') return [];

  const branches = await vcs.listBranches('osq/');
  if (branches.length === 0) return [];

  const worktrees = await vcs.worktreeList();
  const byBranch = new Map<string, string>();
  const gone = new Set<string>();
  for (const worktree of worktrees) {
    if (!(await directoryExists(worktree.path))) gone.add(worktree.path);
    if (worktree.branch !== null) byBranch.set(worktree.branch, worktree.path);
  }
  if (gone.size > 0) await vcs.worktreePrune();

  const missing = branches.filter((branch) => {
    const wtPath = byBranch.get(branch);
    return wtPath === undefined || gone.has(wtPath);
  });
  if (missing.length === 0) return [];

  const repoRoot = (await vcs.root()) ?? projectRoot;
  const changesDir = changesDirLabel(config);
  const lines: string[] = [];
  for (const branch of missing) {
    const folder = branch.slice('osq/'.length);
    if (worktreeBranch(folder) !== branch) continue;
    const wtPath = worktreePath(vcsConfig, repoRoot, folder);
    try {
      const seal = `${changesDir}/${folder}/.run/approved`.split(path.sep).join('/');
      const approved = await vcs.show(branch, seal);
      if (approved === null) continue;
      await vcs.worktreeAdd(wtPath, branch);
      await runPrepare(wtPath, config, branch);
      lines.push(`recreated worktree ${wtPath} for ${folder}`);
    } catch (err) {
      lines.push(`failed to recreate worktree ${wtPath} for ${folder}: ${errorMessage(err)}`);
    }
  }
  return lines;
}
