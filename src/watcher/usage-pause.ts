/**
 * The watcher side of the usage-limit pause. When an agent stops on its model
 * provider's usage limit, the watcher writes `.run/paused.md`, appends the
 * `paused` event, and starts no task or automatic planner on any change until
 * the reset. Built on the marker module `src/core/run/usage-pause.ts`.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_GATES_CONFIG } from '../core/foundation/config-gates.js';
import type { OsqConfig } from '../core/foundation/config.js';
import { type Logger, resolveSymbol } from '../core/foundation/logger.js';
import {
  type UsagePause,
  findUsageLimit,
  formatPauseUntil,
  pauseUntil,
  readActivePause,
  readUsagePause,
  usagePausePath,
  writeUsagePause,
} from '../core/run/usage-pause.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import { selectVcs } from '../core/vcs/select.js';
import { appendHarnessEvent } from '../harness/types.js';
import type { RunTaskResult } from './outcome.js';

/** A task stream's records, skipping malformed lines. A missing file reads empty. */
async function readStream(folderPath: string, stream: string): Promise<unknown[]> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', `${stream}.jsonl`), 'utf8')
    .catch(() => '');
  const events: unknown[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A malformed line never hides a later valid event.
    }
  }
  return events;
}

/** The change folder's leading number, else its whole base name. */
function changeId(folderPath: string): string {
  const base = path.basename(folderPath);
  return /^(\d+)/.exec(base)?.[1] ?? base;
}

/** The events after a stream's last `started`, the current attempt's own. */
function attemptEvents(events: readonly unknown[]): unknown[] {
  let start = -1;
  for (let index = 0; index < events.length; index += 1) {
    if ((events[index] as { type?: string } | null)?.type === 'started') start = index;
  }
  return events.slice(start + 1);
}

/** The configured wait after a limit whose reset time the harness did not give. */
function waitSeconds(config: OsqConfig): number {
  return config.gates?.usageLimitWaitSeconds ?? DEFAULT_GATES_CONFIG.usageLimitWaitSeconds ?? 1800;
}

/**
 * Write `.run/paused.md`, append the `paused` event to `stream`, and log
 * `task <n> of <id> paused until <time> (usage limit)`.
 *
 * @scenario watcher-and-harness: Limit with a reset time
 * @scenario watcher-and-harness: Limit without a reset time
 */
export async function recordUsagePause(
  folderPath: string,
  stream: string,
  pause: UsagePause,
  logger?: Logger,
): Promise<void> {
  await writeUsagePause(folderPath, pause);
  await appendHarnessEvent(folderPath, stream, {
    type: 'paused',
    timestamp: new Date().toISOString(),
    data: {
      task: pause.task,
      until: pause.until,
      source: pause.source,
      ...(pause.error !== undefined ? { error: pause.error } : {}),
    },
  });
  const prefix = resolveSymbol('⏸', '[paused]', logger?.symbols === true);
  logger?.info(
    `${prefix} task ${pause.task} of ${changeId(folderPath)} paused until ${formatPauseUntil(pause.until)} (usage limit)`,
  );
}

/**
 * Pause a task whose current attempt ended on a usage limit. The attempt's
 * events are those after its last `started`; without a `usage_limit` event this
 * returns null and the ordinary failure path judges the attempt.
 *
 * @scenario watcher-and-harness: Limit with a reset time
 * @scenario watcher-and-harness: Limit without a reset time
 * @scenario watcher-and-harness: Limit from an earlier attempt
 */
export async function pauseTaskOnUsageLimit(
  folderPath: string,
  taskNumber: string,
  config: OsqConfig,
  logger?: Logger,
): Promise<RunTaskResult | null> {
  const limit = findUsageLimit(attemptEvents(await readStream(folderPath, taskNumber)));
  if (limit === undefined) return null;
  const { until, source } = pauseUntil(limit, Date.now(), waitSeconds(config));
  const pause: UsagePause = {
    task: taskNumber,
    until,
    source,
    ...(limit.error !== undefined ? { error: limit.error } : {}),
  };
  await recordUsagePause(folderPath, taskNumber, pause, logger);
  return { success: false, paused: { until } };
}

/**
 * The first active change holding a pause that has not passed, or null. The
 * watcher checks this before every spawn and automatic planner run.
 *
 * @scenario watcher-and-harness: Another change waits
 */
export async function findActivePause(
  changes: readonly LocatedChange[],
  now: number,
): Promise<UsagePause | null> {
  for (const change of changes) {
    const pause = await readActivePause(change.folderPath, now);
    if (pause !== null) return pause;
  }
  return null;
}

/**
 * Remove `.run/paused.md` from every active change whose `until` has passed.
 *
 * @scenario watcher-and-harness: Task runs after the reset
 */
export async function removePassedPauses(
  changes: readonly LocatedChange[],
  now: number,
): Promise<void> {
  for (const change of changes) {
    const pause = await readUsagePause(change.folderPath);
    if (pause !== null && Date.parse(pause.until) <= now) {
      await fs.rm(usagePausePath(change.folderPath), { force: true });
    }
  }
}

interface StatusPath {
  readonly path: string;
  readonly from?: string;
}

/** Every status path outside the change folder, a rename's source included. */
function outsideChange(entries: readonly StatusPath[], changeRel: string): string[] {
  const outside = new Set<string>();
  if (changeRel === '' || changeRel === '.') return [];
  for (const entry of entries) {
    for (const candidate of [entry.path, entry.from]) {
      if (candidate === undefined) continue;
      if (candidate === changeRel || candidate.startsWith(`${changeRel}/`)) continue;
      outside.add(candidate);
    }
  }
  return [...outside];
}

/**
 * Discard what the agent changed outside the change folder after a pause, so
 * the rerun starts from the last verified commit. Writes no patch, makes no
 * commit, and leaves the change folder's own files as they are.
 *
 * @scenario watcher-and-harness: Limit with a reset time
 * @scenario watcher-and-harness: Limit without a reset time
 */
export async function discardPausedWorktreeChanges(
  change: LocatedChange,
  config: OsqConfig,
): Promise<void> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return;
  const root = await vcs.root();
  if (root === null) return;
  const changeRel = path.relative(root, change.folderPath).split(path.sep).join('/');
  const discard = outsideChange(await vcs.status(), changeRel);
  if (discard.length > 0) await vcs.discard(discard);
}
