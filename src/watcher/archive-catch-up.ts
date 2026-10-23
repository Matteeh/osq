import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { retrySpec } from '../core/lifecycle/retry.js';
import { commitArchive } from '../core/run/task-commit.js';
import { parseFrontmatter, parseSpecMdFromFolder } from '../core/spec/parser.js';
import { type LocatedChange, listChanges } from '../core/status/change-locations.js';
import { getEventsPath, getRegressedMarkerPath, getSpecsDir } from '../core/status/layout.js';
import { selectVcs } from '../core/vcs/select.js';
import type { Vcs } from '../core/vcs/vcs.js';
import type { WorktreeHalt } from './worktree-run.js';
import { haltWorktreeChange } from './worktree-run.js';

/** A `gates` block built without the key still counts as the public default. */
const DEFAULT_COMMIT_RETRIES = 2;
const CHANGE_TARGET = 'change';

/** One parsed `change.jsonl` line, or null when it is not an event object. */
function parseEvent(line: string): { type?: unknown; data?: Record<string, unknown> } | null {
  try {
    const event = JSON.parse(line) as unknown;
    return typeof event === 'object' && event !== null
      ? (event as { type?: unknown; data?: Record<string, unknown> })
      : null;
  } catch {
    return null;
  }
}

/**
 * The `commit_failed` regressed events since the last human `retry` for the
 * change target. An automatic retry carries `automatic: true` and does not
 * reset the budget; only a human retry does.
 */
async function commitFailedCount(folderPath: string): Promise<number> {
  const raw = await fs.readFile(getEventsPath(folderPath, CHANGE_TARGET), 'utf8').catch(() => '');
  const events = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map(parseEvent);
  let lastManual = -1;
  events.forEach((event, index) => {
    if (
      event?.type === 'retry' &&
      event.data?.target === CHANGE_TARGET &&
      event.data.automatic === undefined
    ) {
      lastManual = index;
    }
  });
  let count = 0;
  for (let index = lastManual + 1; index < events.length; index += 1) {
    const event = events[index];
    if (event?.type === 'regressed' && event.data?.reason === 'commit_failed') count += 1;
  }
  return count;
}

/** Whether the change's active halt marker has reason `commit_failed`. */
async function haltedCommitFailed(change: LocatedChange): Promise<boolean> {
  const marker = await fs
    .readFile(getRegressedMarkerPath(change.folderPath, CHANGE_TARGET), 'utf8')
    .catch(() => null);
  return marker !== null && parseFrontmatter(marker).data.reason === 'commit_failed';
}

/** The change folder's numeric prefix, else its whole name. */
function specIdOf(change: LocatedChange): string {
  return change.folderName.match(/^(\d+)/)?.[1] ?? change.folderName;
}

/** A path relative to `root` as a POSIX path git takes. */
function relativeTo(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/**
 * Restore the moved-away original folder from HEAD, then remove it again, so
 * its deletion is unstaged and `git add` can stage it on the next attempt.
 */
async function unstageOriginalFolder(vcs: Vcs, change: LocatedChange): Promise<void> {
  const root = (await vcs.root()) ?? change.tree.root;
  const originalFolder = path.join(change.tree.changesDir, change.folderName);
  await vcs.discard([relativeTo(root, originalFolder)]).catch(() => undefined);
  await fs.rm(originalFolder, { recursive: true, force: true });
}

/** Commit the archived change's whole archive, returning a `commit_failed` halt. */
async function commitArchived(
  change: LocatedChange,
  config: OsqConfig,
): Promise<WorktreeHalt | null> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return null;
  const root = (await vcs.root()) ?? change.tree.root;
  const title = (await parseSpecMdFromFolder(change.folderPath).catch(() => null))?.title ?? '';
  const originalFolder = path.join(change.tree.changesDir, change.folderName);
  try {
    await unstageOriginalFolder(vcs, change);
    await commitArchive(
      vcs,
      config,
      originalFolder,
      change.tree.archiveDir,
      getSpecsDir(config.paths.openspecRoot, root),
      relativeTo(root, change.folderPath),
      title,
    );
    return null;
  } catch (err) {
    return {
      reason: 'commit_failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Retry the archive commit of every archived change in an osq worktree whose
 * halt reason is `commit_failed`, in numeric order, within
 * `gates.commitRetries`. A failed attempt halts the change again.
 *
 * @scenario watcher-and-harness: Archive commit catch-up
 * @scenario watcher-and-harness: Archive catch-up budget spent
 * @adr 003
 */
export async function catchUpWorktreeArchiveCommits(
  projectRoot: string,
  config: OsqConfig,
  logger?: Logger,
): Promise<void> {
  const archived = (await listChanges(projectRoot, config, ['archived'])).filter(
    (change) => change.tree.worktreeFolder !== undefined,
  );
  const retries = config.gates?.commitRetries ?? DEFAULT_COMMIT_RETRIES;
  for (const change of archived) {
    if (!(await haltedCommitFailed(change))) continue;
    if ((await commitFailedCount(change.folderPath)) > retries) continue;
    const specId = specIdOf(change);
    await retrySpec(projectRoot, specId, CHANGE_TARGET, config, { automatic: true });
    const halt = await commitArchived(change, config);
    if (halt !== null) {
      logger?.warn(`archive commit failed: ${halt.detail}`);
      await haltWorktreeChange(change, specId, halt, logger, config.limits);
      continue;
    }
    logger?.info(
      `${resolveSymbol('↻', '[retry]', logger?.symbols === true)} archive of ${specId} committed after commit_failed`,
    );
  }
}
