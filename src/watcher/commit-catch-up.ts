import fs from 'node:fs/promises';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import { retrySpec } from '../core/lifecycle/retry.js';
import { parseFrontmatter } from '../core/spec/parser.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import { getDeadMarkerPath, getEventsPath, getRegressedMarkerPath } from '../core/status/layout.js';
import { selectVcs } from '../core/vcs/select.js';
import type { VcsStatusEntry } from '../core/vcs/vcs.js';
import type { RunTaskFailureReason } from './failure-reason.js';
import { commitWorktreeDeadTask } from './worktree-commit.js';
import { haltWorktreeChange, relativeChange } from './worktree-run.js';

/** A `gates` block built without the key still counts as the public default. */
const DEFAULT_COMMIT_RETRIES = 2;

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
  const raw = await fs.readFile(getEventsPath(folderPath, 'change'), 'utf8').catch(() => '');
  const events = raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map(parseEvent);
  let lastManual = -1;
  events.forEach((event, index) => {
    if (
      event?.type === 'retry' &&
      event.data?.target === 'change' &&
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

/** Active dead markers status lists as untracked or added, in task order. */
function pendingDeadTasks(entries: readonly VcsStatusEntry[], changeRel: string): string[] {
  const prefix = `${changeRel}/.run/dead/`;
  const numbers = new Set<string>();
  for (const entry of entries) {
    if (entry.code !== '??' && !entry.code.startsWith('A')) continue;
    if (!entry.path.startsWith(prefix)) continue;
    const match = /^(\d+)\.md$/.exec(entry.path.slice(prefix.length));
    if (match?.[1] !== undefined) numbers.add(match[1]);
  }
  return [...numbers].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

/** The reason in a dead marker's frontmatter, defaulting when it is absent. */
async function deadReason(folderPath: string, task: string): Promise<RunTaskFailureReason> {
  const content = await fs.readFile(getDeadMarkerPath(folderPath, task), 'utf8').catch(() => '');
  const reason = parseFrontmatter(content).data.reason;
  return (
    typeof reason === 'string' && reason !== '' ? reason : 'no_result'
  ) as RunTaskFailureReason;
}

/** Commit one pending dead record; false and a halt when the commit fails. */
async function commitPendingDead(
  change: LocatedChange,
  specId: string,
  config: OsqConfig,
  logger?: Logger,
): Promise<boolean> {
  const vcs = await selectVcs(change.tree.root, config);
  const changeRel = relativeChange(change.tree.root, change.folderPath);
  for (const task of pendingDeadTasks(await vcs.status(), changeRel)) {
    const halt = await commitWorktreeDeadTask(
      change,
      config,
      task,
      await deadReason(change.folderPath, task),
    );
    if (halt) {
      await haltWorktreeChange(change, specId, halt, logger, config.limits);
      return false;
    }
  }
  return true;
}

/**
 * Commit a worktree change's pending dead records and clear a `commit_failed`
 * halt when they commit, within `gates.commitRetries`. Returns false when the
 * change stays halted this cycle and the caller skips it.
 */
export async function catchUpWorktreeCommits(
  change: LocatedChange,
  specId: string,
  config: OsqConfig,
  logger?: Logger,
): Promise<boolean> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return true;

  const marker = await fs
    .readFile(getRegressedMarkerPath(change.folderPath, 'change'), 'utf8')
    .catch(() => null);
  let haltedCommitFailed = false;
  if (marker !== null) {
    if (parseFrontmatter(marker).data.reason !== 'commit_failed') return true;
    haltedCommitFailed = true;
    const retries = config.gates?.commitRetries ?? DEFAULT_COMMIT_RETRIES;
    if ((await commitFailedCount(change.folderPath)) > retries) return false;
  }

  if (!(await commitPendingDead(change, specId, config, logger))) return false;

  if (haltedCommitFailed) {
    await retrySpec(change.tree.root, specId, 'change', config, { automatic: true });
    logger?.info(
      `${resolveSymbol('↻', '[retry]', logger?.symbols === true)} change of ${specId} caught up after commit_failed`,
    );
  }
  return true;
}
