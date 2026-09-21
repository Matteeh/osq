import fs from 'node:fs/promises';
import path from 'node:path';
import { findSpecFolder } from './approve.js';
import type { OsqConfig } from './config.js';
import { hashChangeFolder } from './hasher.js';
import { getChangeRunDir, getChangesDir } from './layout.js';
import { parseFrontmatter } from './parser.js';

/**
 * Explicit retry transition. Retry is the sole operation that retires an active
 * dead or regressed marker: it renames the active failure into attempt-suffixed
 * history rather than deleting it, so the task (or change) derives as runnable
 * again while every diagnostic stays on disk.
 */

const CHANGE_TARGET = 'change';
const NUMERIC_TARGET = /^\d+$/;

export interface RetryResult {
  readonly specId: string;
  readonly folderName: string;
  readonly folderPath: string;
  readonly target: string;
  readonly reason: string;
  /** Following execution attempt; the next started event carries this number. */
  readonly attempt: number;
  /** Folder-relative paths of every marker renamed into history. */
  readonly retainedMarkers: string[];
}

async function pathExists(target: string): Promise<boolean> {
  return fs.stat(target).then(
    () => true,
    () => false,
  );
}

async function listDir(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}

/** Highest attempt ordinal already retained for `target` across both failure kinds. */
function retainedOrdinal(entries: readonly string[], target: string): number {
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\.(\\d+)\\.md$`);
  let highest = 0;
  for (const entry of entries) {
    const match = entry.match(pattern);
    if (!match) continue;
    const ordinal = Number.parseInt(match[1], 10);
    if (ordinal > highest) highest = ordinal;
  }
  return highest;
}

/** Failure reason from marker frontmatter, falling back to the marker kind. */
function markerReason(content: string, fallback: string): string {
  const { data } = parseFrontmatter(content);
  const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
  return reason || fallback;
}

/**
 * Append the typed `retry` event directly rather than through the harness layer
 * so `src/core` stays free of cross-tier imports, mirroring `done_manual`.
 */
async function appendRetryEvent(
  folderPath: string,
  target: string,
  reason: string,
  attempt: number,
): Promise<void> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = {
    type: 'retry',
    timestamp: new Date().toISOString(),
    data: { target, reason, attempt },
  };
  await fs.appendFile(
    path.join(eventsDir, `${target}.jsonl`),
    `${JSON.stringify(event)}\n`,
    'utf8',
  );
}

/**
 * Validate approval, running state, and active failure, then rename the active
 * failure markers into attempt-suffixed history and record the retry. Every
 * refusal happens before the first mutation, so an invalid retry leaves all
 * markers and events byte-for-byte intact.
 */
export async function retrySpec(
  projectRoot: string,
  specIdOrPrefix: string,
  target: string,
  config: OsqConfig,
): Promise<RetryResult> {
  const rawTarget = target.trim();
  if (rawTarget !== CHANGE_TARGET && !NUMERIC_TARGET.test(rawTarget)) {
    throw new Error(`Invalid retry target "${target}": expected a numeric task or "change".`);
  }

  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const folderPath = await findSpecFolder(specsDir, specIdOrPrefix);
  const folderName = path.basename(folderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const runDir = getChangeRunDir(folderPath);

  // Approval integrity is checked before any marker or event is touched.
  const approvedPath = path.join(runDir, 'approved');
  const approvedHash = await fs
    .readFile(approvedPath, 'utf8')
    .then((value) => value.trim())
    .catch(() => '');
  if (!approvedHash) {
    throw new Error(
      `Change ${specId} is not approved. Run \`osq approve ${specId}\` before retrying.`,
    );
  }
  const currentHash = await hashChangeFolder(folderPath);
  if (currentHash !== approvedHash) {
    throw new Error(
      `Change ${specId} no longer matches its approved hash. Run \`osq approve ${specId}\` before retrying.`,
    );
  }

  // A running target is never retried; never mutate under a live lock.
  const runningDir = path.join(runDir, 'running');
  if (rawTarget === CHANGE_TARGET) {
    const running = (await listDir(runningDir)).filter((entry) => entry.endsWith('.pid'));
    if (running.length > 0) {
      throw new Error(`Change ${specId} has a running task; retry is refused.`);
    }
  } else if (await pathExists(path.join(runningDir, `${rawTarget}.pid`))) {
    throw new Error(`Task ${rawTarget} is running; retry is refused.`);
  }

  const deadDir = path.join(runDir, 'dead');
  const regressedDir = path.join(runDir, 'regressed');
  const deadEntries = await listDir(deadDir);
  const regressedEntries = await listDir(regressedDir);

  const deadPath = path.join(deadDir, `${rawTarget}.md`);
  const regressedPath = path.join(regressedDir, `${rawTarget}.md`);
  // Only a task can be dead; the change target accepts a change-level regression.
  const hasDead = rawTarget !== CHANGE_TARGET && (await pathExists(deadPath));
  const hasRegressed = await pathExists(regressedPath);
  if (!hasDead && !hasRegressed) {
    const label = rawTarget === CHANGE_TARGET ? 'change-level regression' : `task ${rawTarget}`;
    throw new Error(`No active failure marker for ${label} in ${folderName}; retry is refused.`);
  }

  // Regression takes state precedence over dead for retry context.
  const reason = hasRegressed
    ? markerReason(await fs.readFile(regressedPath, 'utf8'), 'regressed')
    : markerReason(await fs.readFile(deadPath, 'utf8'), 'dead');

  const ordinal =
    Math.max(
      retainedOrdinal(deadEntries, rawTarget),
      retainedOrdinal(regressedEntries, rawTarget),
    ) + 1;
  const retainedMarkers: string[] = [];

  if (hasRegressed) {
    const destination = path.join(regressedDir, `${rawTarget}.${ordinal}.md`);
    await fs.rename(regressedPath, destination);
    retainedMarkers.push(path.relative(folderPath, destination));
  }
  if (hasDead) {
    const destination = path.join(deadDir, `${rawTarget}.${ordinal}.md`);
    await fs.rename(deadPath, destination);
    retainedMarkers.push(path.relative(folderPath, destination));
  }

  // A regressed completion must also be retired so the task derives pending.
  if (hasRegressed && rawTarget !== CHANGE_TARGET) {
    const donePath = path.join(runDir, 'done', rawTarget);
    if (await pathExists(donePath)) {
      const destination = path.join(runDir, 'done', `${rawTarget}.${ordinal}`);
      await fs.rename(donePath, destination);
      retainedMarkers.push(path.relative(folderPath, destination));
    }
  }

  const attempt = ordinal + 1;
  await appendRetryEvent(folderPath, rawTarget, reason, attempt);

  return {
    specId,
    folderName,
    folderPath,
    target: rawTarget,
    reason,
    attempt,
    retainedMarkers,
  };
}
