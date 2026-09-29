import path from 'node:path';
import type { Vcs } from '../vcs/vcs.js';
import { worktreeBranch } from '../vcs/worktree.js';

/** The rejected change's record, relative to `projectRoot` in POSIX form. */
function rejectedRecord(projectRoot: string, folderPath: string, folderName: string): string {
  const record = path.join(path.dirname(folderPath), 'rejected', folderName, '.run', 'rejected.md');
  return path.relative(projectRoot, record).split(path.sep).join('/');
}

/** Whether any worktree lists `branch` as checked out. */
async function isCheckedOut(vcs: Vcs, branch: string): Promise<boolean> {
  return (await vcs.worktreeList()).some((tree) => tree.branch === branch);
}

/** The lowest `osq/<folder>-rejected-<n>` that is still free, from 1. */
async function nextKeptName(vcs: Vcs, branch: string): Promise<string> {
  const taken = new Set(await vcs.listBranches(`${branch}-rejected-`));
  let n = 1;
  while (taken.has(`${branch}-rejected-${n}`)) n += 1;
  return `${branch}-rejected-${n}`;
}

/**
 * Claim the change's branch for a fresh approval. A branch whose tip holds the
 * change's rejection record and that no worktree has checked out is renamed
 * aside to `osq/<folder>-rejected-<n>`, and that name is returned; a missing
 * branch returns null; any other existing branch refuses.
 */
export async function claimBranch(
  vcs: Vcs,
  projectRoot: string,
  folderPath: string,
  folderName: string,
): Promise<string | null> {
  const branch = worktreeBranch(folderName);
  if (!(await vcs.listBranches(branch)).includes(branch)) return null;
  const record = rejectedRecord(projectRoot, folderPath, folderName);
  if (!(await vcs.pathExists(branch, record)) || (await isCheckedOut(vcs, branch))) {
    throw new Error(`branch ${branch} already exists`);
  }
  const kept = await nextKeptName(vcs, branch);
  await vcs.renameBranch(branch, kept);
  return kept;
}
