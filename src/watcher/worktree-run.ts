import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import { selectVcs } from '../core/vcs/select.js';
import type { VcsStatusEntry } from '../core/vcs/vcs.js';
import { recordRegressedEvent, writeRegressedMarker } from './outcome.js';

/** Why a worktree change halts before it spawns or archives. */
export type WorktreeHaltReason = 'worktree_off_branch' | 'worktree_dirty' | 'commit_failed';

/** A halt: the regression reason and the detail its marker body carries. */
export interface WorktreeHalt {
  readonly reason: WorktreeHaltReason;
  readonly detail: string;
}

/** A change folder path as a worktree-root-relative POSIX path. */
export function relativeChange(root: string, folderPath: string): string {
  return path.relative(root, folderPath).split(path.sep).join('/');
}

/** The only uncommitted paths a worktree run tolerates: its `.run/` and `tasks.md`. */
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

/**
 * The worktree precondition before a spawn or an archive: HEAD on
 * `osq/<folder>` and status listing nothing outside the change folder's `.run/`
 * other than its `tasks.md`.
 */
export async function checkWorktree(
  change: LocatedChange,
  config: OsqConfig,
): Promise<WorktreeHalt | null> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return null;
  const expected = `osq/${change.folderName}`;
  const head = await vcs.head();
  if (head.branch !== expected) {
    return { reason: 'worktree_off_branch', detail: head.branch ?? 'detached HEAD' };
  }
  const changeRel = relativeChange(change.tree.root, change.folderPath);
  const dirt = worktreeDirt(await vcs.status(), changeRel);
  if (dirt.length > 0) return { reason: 'worktree_dirty', detail: dirt.join('\n') };
  return null;
}

/** Write the change-level regression marker, its event, and one halt line. */
export async function haltWorktreeChange(
  change: LocatedChange,
  specId: string,
  halt: WorktreeHalt,
  logger?: Logger,
): Promise<void> {
  const runDir = path.join(change.folderPath, '.run');
  await writeRegressedMarker(
    runDir,
    'change',
    `---\nreason: ${halt.reason}\n---\n${halt.detail}\n`,
  );
  await recordRegressedEvent(change.folderPath, 'change', {
    reason: halt.reason,
    output: halt.detail,
  });
  const symbols = logger?.symbols === true;
  logger?.info(`${resolveSymbol('■', '[halted]', symbols)} spec ${specId} halted (${halt.reason})`);
}
