import fs from 'node:fs/promises';
import path from 'node:path';
import { type Logger, resolveSymbol } from '../core/logger.js';
import {
  type DeadEventData,
  type DoneEventData,
  type HarnessEvent,
  appendHarnessEvent,
} from '../harness/types.js';

export type RunTaskFailureReason =
  | 'spec_conflict'
  | 'already_running'
  | 'no_result'
  | 'verify_red'
  | 'crashed'
  | 'timeout'
  | 'undeclared_test_change';

export interface RunTaskResult {
  success: boolean;
  reason?: RunTaskFailureReason;
  error?: string;
}

/**
 * Tick the checkbox for `taskNumber` inside a `tasks.md` body. Supports both
 * checklist shapes osq accepts: a flat numbered list (`- [ ] 3. ...`) and a
 * grouped list whose identifier lives either on the item or on the enclosing
 * `## <n>.` section header. Returns the rewritten content, or the input
 * unchanged when no matching pending item exists. This is the whole projection:
 * it never consults or mutates `.run/` state and its output is normalized by
 * the folder hasher, so ticking can never invalidate an approval hash.
 */
export function tickTaskCheckboxContent(content: string, taskNumber: string): string {
  const target = Number.parseInt(taskNumber, 10);
  if (Number.isNaN(target)) {
    return content;
  }

  const lines = content.split('\n');
  let sectionNumber: number | null = null;
  let changed = false;

  const updated = lines.map((line) => {
    // Any `## ` heading resets the section scope; only a numeric heading
    // associates unnumbered items with a task.
    const headingMatch = line.match(/^##\s+(\S.*?)\s*$/);
    if (headingMatch) {
      const numeric = headingMatch[1].match(/^(\d+)[.)]?(?:\s|$)/);
      sectionNumber = numeric ? Number.parseInt(numeric[1], 10) : null;
      return line;
    }

    const itemMatch = line.match(/^(\s*-\s+\[)([ xX])(\]\s*)((?:(\d+)[.)]\s+)?)(.*)$/);
    if (!itemMatch) {
      return line;
    }

    const [, prefix, mark, close, numberedPrefix, itemNumber, rest] = itemMatch;
    const identifier = itemNumber ? Number.parseInt(itemNumber, 10) : sectionNumber;
    if (identifier !== target || mark.toLowerCase() === 'x') {
      return line;
    }

    changed = true;
    return `${prefix}x${close}${numberedPrefix}${rest}`;
  });

  return changed ? updated.join('\n') : content;
}

/**
 * Project a passed task into `tasks.md`. Write-only: reads the checklist to
 * locate the row, rewrites it, and never touches any `.run/` marker.
 */
export async function tickTaskCheckbox(specFolderPath: string, taskNumber: string): Promise<void> {
  const tasksMdPath = path.join(specFolderPath, 'tasks.md');
  let content = '';
  try {
    content = await fs.readFile(tasksMdPath, 'utf8');
  } catch {
    return;
  }

  const updated = tickTaskCheckboxContent(content, taskNumber);
  if (updated !== content) {
    await fs.writeFile(tasksMdPath, updated, 'utf8');
  }
}

/**
 * Single code path for process lifecycle observation: the events.jsonl entry and
 * its human readable summary are always emitted together.
 */
export async function recordLifecycleEvent(
  specFolderPath: string,
  taskNumber: string,
  event: HarnessEvent,
  summary: string,
  logger?: Logger,
  level: 'info' | 'verbose' = 'info',
): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, event);
  if (level === 'verbose') {
    logger?.verbose(summary);
  } else {
    logger?.info(summary);
  }
}

/**
 * Append the `dead` event that always travels with a dead marker, keeping the
 * event stream in agreement with the marker. A lock collision never records one.
 */
export async function recordDeadEvent(
  specFolderPath: string,
  taskNumber: string,
  reason: RunTaskFailureReason,
): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'dead',
    timestamp: new Date().toISOString(),
    data: { task: taskNumber, reason } satisfies DeadEventData,
  });
}

/**
 * Append the `done` event that always travels with a `done/<n>` marker.
 */
export async function recordDoneEvent(specFolderPath: string, taskNumber: string): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'done',
    timestamp: new Date().toISOString(),
    data: { task: taskNumber } satisfies DoneEventData,
  });
}

/** Format the dead marker body for a lock the reaper unlinked. */
export function formatReapedMarker(
  reason: 'crashed' | 'timeout',
  pid: number,
  startedAt: number,
  reapedAt: number = Date.now(),
): string {
  return [
    '---',
    `reason: ${reason}`,
    `pid: ${pid}`,
    `started_at: ${new Date(startedAt).toISOString()}`,
    `reaped_at: ${new Date(reapedAt).toISOString()}`,
    '---',
    `Task execution terminated by watcher reaper (${reason}).`,
    '',
  ].join('\n');
}

/**
 * Write the `.run/dead/<n>.md` marker, creating the directory when needed so
 * every failure exit persists its diagnosis through one path.
 */
export async function writeDeadMarker(
  runDir: string,
  taskNumber: string,
  content: string,
): Promise<void> {
  const deadDir = path.join(runDir, 'dead');
  await fs.mkdir(deadDir, { recursive: true });
  await fs.writeFile(path.join(deadDir, `${taskNumber}.md`), content, 'utf8');
}

/**
 * Write the timestamped `.run/done/<n>` marker that records task completion.
 */
export async function writeDoneMarker(runDir: string, taskNumber: string): Promise<void> {
  const doneDir = path.join(runDir, 'done');
  await fs.mkdir(doneDir, { recursive: true });
  await fs.writeFile(path.join(doneDir, taskNumber), `${new Date().toISOString()}\n`, 'utf8');
}

/**
 * Curated task-outcome line: verified or dead with the failure reason and the
 * elapsed seconds since the task began.
 */
export function formatTaskOutcomeLine(
  taskNumber: string,
  success: boolean,
  reason: RunTaskFailureReason | undefined,
  elapsedSeconds: number,
  symbols: boolean,
  extra?: string,
): string {
  if (success) {
    return `${resolveSymbol('✓', '[ok]', symbols)} task ${taskNumber} verified (elapsed: ${elapsedSeconds}s)`;
  }
  const detail = extra ? `, ${extra}` : '';
  return `${resolveSymbol('✗', '[dead]', symbols)} task ${taskNumber} dead (reason: ${reason}${detail}, elapsed: ${elapsedSeconds}s)`;
}
