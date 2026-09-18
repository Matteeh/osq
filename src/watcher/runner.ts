import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { hashChangeFolder } from '../core/hasher.js';
import { acquireLock, releaseLock } from '../core/lock.js';
import { type Logger, resolveSymbol } from '../core/logger.js';
import { parseTaskMd } from '../core/parser.js';
import { asRecord } from '../harness/stream.js';
import {
  type DeadEventData,
  type DoneEventData,
  type HarnessAdapter,
  type HarnessEvent,
  appendHarnessEvent,
} from '../harness/types.js';
import { resolveBuildInfo } from './build.js';

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
async function recordLifecycleEvent(
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
 * Append the `dead` event that always travels with a dead marker. The event
 * stream is the append-only source of truth for failure history, so it must
 * agree with the marker at every exit. A lock collision never writes a dead
 * marker and therefore never records a dead event.
 */
async function recordDeadEvent(
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
async function recordDoneEvent(specFolderPath: string, taskNumber: string): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'done',
    timestamp: new Date().toISOString(),
    data: { task: taskNumber } satisfies DoneEventData,
  });
}

export interface TaskHeartbeatStats {
  elapsedSeconds: number;
  eventCount: number;
  totalTokens: number;
  toolCount: number;
  cost?: number;
  lastToolSummary?: string;
}

/**
 * In-memory counters accumulated as the append-only event stream grows. The
 * byte offset lets a poll parse only the newly appended complete lines instead
 * of re-reading and re-counting the whole file on every heartbeat tick.
 */
interface HeartbeatAccumulator {
  byteOffset: number;
  eventCount: number;
  totalTokens: number;
  toolCount: number;
  cost: number;
  hasCost: boolean;
  lastToolSummary?: string;
}

const heartbeatAccumulators = new Map<string, HeartbeatAccumulator>();

function createHeartbeatAccumulator(): HeartbeatAccumulator {
  return { byteOffset: 0, eventCount: 0, totalTokens: 0, toolCount: 0, cost: 0, hasCost: false };
}

/**
 * Strip the project root the harness actually ran in from absolute paths
 * embedded in a tool summary, so the status row reads a clean repository
 * relative path (e.g. `specs/014-...`) rather than the full machine path. Only
 * the rendered copy is relativized; the raw summary written to
 * `.run/events/<n>.jsonl` is never rewritten. Falls back to the process working
 * directory when `root` is omitted.
 */
export function relativizeToolSummary(summary: string, root: string = process.cwd()): string {
  if (!summary || !root) {
    return summary;
  }

  // Compare without a trailing separator so `${normalizedRoot}/` strips
  // cleanly, but keep a bare filesystem root intact so it is not reduced to an
  // empty string that would match every separator in the summary.
  const normalizedRoot = root.length > 1 ? root.replace(/[\\/]+$/, '') : root;
  if (!normalizedRoot || normalizedRoot === '/' || normalizedRoot === '\\') {
    return summary;
  }

  const escapedRoot = normalizedRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withSeparator = new RegExp(`${escapedRoot}[\\\\/]`, 'g');
  const relativized = summary.replace(withSeparator, '');

  // A summary that is exactly the root has no trailing separator to strip.
  const exactRoot = new RegExp(`${escapedRoot}(?=$|[\\s"'()\\[\\]{},;:])`, 'g');
  return relativized.replace(exactRoot, '.');
}

/**
 * Snapshot of task progress. Counters are maintained in memory and advanced
 * with only the bytes appended since the previous poll; the event file may not
 * exist yet, in which case counters are zero. Tool summaries are stored
 * relativized to `projectRoot` for display.
 */
export async function computeTaskHeartbeatStats(
  specFolderPath: string,
  taskNumber: string,
  startTime: number,
  projectRoot?: string,
): Promise<TaskHeartbeatStats> {
  const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));
  const eventFilePath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);

  let content = '';
  try {
    content = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    heartbeatAccumulators.delete(eventFilePath);
    return { elapsedSeconds, eventCount: 0, totalTokens: 0, toolCount: 0 };
  }

  let accumulator = heartbeatAccumulators.get(eventFilePath);
  if (!accumulator || accumulator.byteOffset > content.length) {
    accumulator = createHeartbeatAccumulator();
  }

  const fresh = content.slice(accumulator.byteOffset);
  const lastNewline = fresh.lastIndexOf('\n');
  if (lastNewline !== -1) {
    const complete = fresh.slice(0, lastNewline);
    accumulator.byteOffset += lastNewline + 1;

    for (const line of complete.split('\n')) {
      if (!line.trim()) {
        continue;
      }
      accumulator.eventCount += 1;

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        // Ignore malformed lines rather than losing the whole heartbeat.
        continue;
      }
      const event = asRecord(parsed);
      if (!event) {
        continue;
      }

      const data = asRecord(event.data);
      if (event.type === 'tokens') {
        accumulator.totalTokens += Number(data?.totalTokens ?? 0) || 0;
        const cost = Number(data?.cost);
        if (Number.isFinite(cost)) {
          accumulator.cost += cost;
          accumulator.hasCost = true;
        }
      } else if (event.type === 'tool') {
        accumulator.toolCount += 1;
        const summary = data?.summary;
        if (typeof summary === 'string') {
          accumulator.lastToolSummary = relativizeToolSummary(summary, projectRoot);
        }
      }
    }
  }

  heartbeatAccumulators.set(eventFilePath, accumulator);

  const stats: TaskHeartbeatStats = {
    elapsedSeconds,
    eventCount: accumulator.eventCount,
    totalTokens: accumulator.totalTokens,
    toolCount: accumulator.toolCount,
  };
  if (accumulator.hasCost) {
    stats.cost = accumulator.cost;
  }
  if (accumulator.lastToolSummary !== undefined) {
    stats.lastToolSummary = accumulator.lastToolSummary;
  }
  return stats;
}

/**
 * Drop the in-memory counters for a finished task so the map does not grow
 * across watcher cycles.
 */
export function clearTaskHeartbeatStats(specFolderPath: string, taskNumber: string): void {
  const eventFilePath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);
  heartbeatAccumulators.delete(eventFilePath);
}

const ELLIPSIS = '…';

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) {
    return '';
  }
  if (text.length <= width) {
    return text;
  }
  if (width === 1) {
    return ELLIPSIS;
  }
  return `${text.slice(0, width - 1)}${ELLIPSIS}`;
}

/**
 * Compact token count for the live status row and the heartbeat line: below
 * 1000 as an integer, below 1M as `X.Xk`, at or above 1M as `X.XM`. A value
 * that rounds up to `1000.0k` rolls over to `1.0M` so the suffix never grows.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }
  if (tokens < 1_000_000) {
    const k = (tokens / 1000).toFixed(1);
    if (k === '1000.0') {
      return '1.0M';
    }
    return `${k}k`;
  }
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/**
 * Single-line running status row. The logger owns the animated spinner, the
 * `<frame> ` prefix, and terminal-width truncation, so this assembles the full
 * row and leaves fitting to the sink.
 */
export function formatTaskStatusRow(taskNumber: string, stats: TaskHeartbeatStats): string {
  const segments = [
    `task ${taskNumber}`,
    `${stats.elapsedSeconds}s`,
    `${stats.toolCount} tools`,
    `${formatTokens(stats.totalTokens)} tokens`,
  ];
  if (typeof stats.cost === 'number' && Number.isFinite(stats.cost)) {
    segments.push(`$${stats.cost.toFixed(4)}`);
  }

  const base = segments.join(' · ');
  if (!stats.lastToolSummary) {
    return base;
  }
  return `${base} · ${stats.lastToolSummary}`;
}

/** Periodic heartbeat line shared by the 1s TTY row and the non-TTY log. */
export function formatTaskHeartbeatLine(taskNumber: string, stats: TaskHeartbeatStats): string {
  return `task ${taskNumber} heartbeat (elapsed: ${stats.elapsedSeconds}s, events: ${stats.eventCount}, tokens: ${formatTokens(stats.totalTokens)})`;
}

/**
 * Curated task-started line: a single info line carrying the task title
 * truncated so the whole line fits the terminal width. The lifecycle details
 * (pid, timeout) travel with it so the marker and the log line stay in sync.
 */
export function formatTaskStartedLine(
  taskNumber: string,
  title: string,
  pid: number | undefined,
  timeoutSeconds: number,
  symbols: boolean,
  terminalWidth: number = (process.stderr as unknown as { columns?: number }).columns ?? 80,
): string {
  const symbol = resolveSymbol('▶', '[task]', symbols);
  const prefix = `${symbol} task ${taskNumber} started (pid: ${pid ?? 'unknown'}, timeout: ${timeoutSeconds}s): `;
  const budget = Math.max(0, terminalWidth - prefix.length);
  return `${prefix}${truncateToWidth(title, budget)}`;
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

/**
 * Return the last text message emitted on the agent's event stream, or null
 * when the stream has no text at all. Synthesis reads exclusively from
 * first-class `text` events carrying the completed assistant message; raw
 * harness payload shapes are never inspected. The stream is the append-only
 * `.run/events/<n>.jsonl` file, so this survives a watcher restart.
 */
export async function extractFinalTextFromStream(
  specFolderPath: string,
  taskNumber: string,
): Promise<string | null> {
  const eventFilePath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);

  let content = '';
  try {
    content = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return null;
  }

  let finalText: string | null = null;
  for (const line of content.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    if (event?.type !== 'text') {
      continue;
    }
    const text = asRecord(event.data)?.text;
    if (typeof text === 'string' && text.trim().length > 0) {
      finalText = text;
    }
  }

  return finalText?.trim() ? finalText : null;
}

/**
 * Write a result file synthesized from the agent's final stream message. The
 * frontmatter flags it as `synthesized: true` and a comment attributes it to
 * the watcher so a reader never mistakes it for an agent-authored result.
 */
export async function synthesizeResultFile(
  resultsDir: string,
  taskNumber: string,
  finalText: string,
): Promise<string> {
  await fs.mkdir(resultsDir, { recursive: true });
  const resultPath = path.join(resultsDir, `${taskNumber}.md`);
  const body = finalText.endsWith('\n') ? finalText : `${finalText}\n`;
  const content = [
    '---',
    'synthesized: true',
    '---',
    "<!-- Synthesized by the osq watcher from the agent's final stream message.",
    '     The agent exited without writing a result file. -->',
    '',
    body,
  ].join('\n');

  await fs.writeFile(resultPath, content, 'utf8');
  return resultPath;
}

const TEST_DIR_NAME = 'tests';

function hashFileContent(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Snapshot every preexisting file under `tests/` as repo-relative path ->
 * content hash. Captured before the agent is spawned so a change or deletion
 * can be attributed to the task. A file that does not exist yet cannot enter
 * the snapshot, so creating a brand new test is never treated as touching an
 * existing one.
 */
async function snapshotTestFiles(projectRoot: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();

  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const relative = path.relative(projectRoot, full).split(path.sep).join('/');
        snapshot.set(relative, hashFileContent(await fs.readFile(full)));
      }
    }
  };

  await walk(path.join(projectRoot, TEST_DIR_NAME));
  return snapshot;
}

/**
 * Compare a pre-spawn `tests/` snapshot against the current tree and return a
 * diagnostic for every preexisting test file whose contents changed or that no
 * longer exists. Paths absent from the snapshot are ignored, so new files are
 * always allowed.
 */
async function findUndeclaredTestChanges(
  projectRoot: string,
  snapshot: Map<string, string>,
): Promise<string[]> {
  const changes: string[] = [];

  for (const [relative, expectedHash] of snapshot) {
    let currentHash: string;
    try {
      currentHash = hashFileContent(await fs.readFile(path.join(projectRoot, relative)));
    } catch {
      changes.push(`${relative} (deleted)`);
      continue;
    }
    if (currentHash !== expectedHash) {
      changes.push(`${relative} (modified)`);
    }
  }

  return changes.sort();
}

export async function runTask(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
): Promise<RunTaskResult> {
  const runDir = path.join(specFolderPath, '.run');
  const deadDir = path.join(runDir, 'dead');
  const doneDir = path.join(runDir, 'done');

  const startTime = Date.now();
  const useSymbols = logger?.symbols === true;
  const interactive = logger?.interactive === true;
  const heartbeatSeconds = config.log?.heartbeatSeconds ?? 60;
  const heartbeatIntervalMs = heartbeatSeconds * 1000;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let heartbeatActive = true;
  let lastHeartbeatLogAt = startTime;

  // One timer owns both observation modes: the 1s TTY status row and the
  // periodic non-TTY heartbeat log. TTY heartbeats are demoted to verbose.
  const stopHeartbeat = (): void => {
    heartbeatActive = false;
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    logger?.clearStatus();
  };

  const logOutcome = (success: boolean, reason?: RunTaskFailureReason, extra?: string): void => {
    stopHeartbeat();
    const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));
    logger?.info(
      formatTaskOutcomeLine(taskNumber, success, reason, elapsedSeconds, useSymbols, extra),
    );
  };

  const approvedPath = path.join(runDir, 'approved');
  let approvedHash = '';
  try {
    approvedHash = (await fs.readFile(approvedPath, 'utf8')).trim();
  } catch {
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, `${taskNumber}.md`),
      '---\nreason: spec_conflict\n---\nSpec has not been approved (missing .run/approved).\n',
      'utf8',
    );
    await recordDeadEvent(specFolderPath, taskNumber, 'spec_conflict');
    logOutcome(false, 'spec_conflict');
    return { success: false, reason: 'spec_conflict', error: 'Missing .run/approved' };
  }

  const currentHash = await hashChangeFolder(specFolderPath);
  if (currentHash !== approvedHash) {
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, `${taskNumber}.md`),
      `---\nreason: spec_conflict\napproved_hash: "${approvedHash}"\ncurrent_hash: "${currentHash}"\n---\nChange folder modified after approval. Expected ${approvedHash}, computed ${currentHash}.\n`,
      'utf8',
    );
    await recordDeadEvent(specFolderPath, taskNumber, 'spec_conflict');
    logOutcome(false, 'spec_conflict');
    return {
      success: false,
      reason: 'spec_conflict',
      error: `Folder hash mismatch: expected ${approvedHash}, got ${currentHash}`,
    };
  }

  const taskPath = path.join(specFolderPath, 'tasks', `${taskNumber}.md`);
  let taskContent = '';
  try {
    taskContent = await fs.readFile(taskPath, 'utf8');
  } catch (err) {
    await fs.mkdir(deadDir, { recursive: true });
    await fs.writeFile(
      path.join(deadDir, `${taskNumber}.md`),
      `---\nreason: crashed\n---\nTask file not found: ${taskPath}\n`,
      'utf8',
    );
    await recordDeadEvent(specFolderPath, taskNumber, 'crashed');
    logOutcome(false, 'crashed');
    return { success: false, reason: 'crashed', error: 'Task file not found' };
  }
  const taskData = parseTaskMd(taskContent);

  const lockResult = await acquireLock(runDir, taskNumber);
  if (!lockResult.acquired) {
    // A lock collision means another process is actively running this task, not
    // that the task failed. It writes no dead marker, so it must not append a
    // dead event either; only a dead marker write may record a dead event.
    logOutcome(false, 'already_running');
    return { success: false, reason: 'already_running', error: 'Task is already running' };
  }

  if (heartbeatIntervalMs > 0) {
    const tickIntervalMs = interactive ? Math.min(heartbeatIntervalMs, 1000) : heartbeatIntervalMs;
    heartbeatTimer = setInterval(() => {
      computeTaskHeartbeatStats(specFolderPath, taskNumber, startTime, projectRoot)
        .then((stats) => {
          if (!heartbeatActive) return;
          if (interactive) {
            logger?.status(formatTaskStatusRow(taskNumber, stats));
            const now = Date.now();
            if (now - lastHeartbeatLogAt >= heartbeatIntervalMs) {
              lastHeartbeatLogAt = now;
              logger?.verbose(formatTaskHeartbeatLine(taskNumber, stats));
            }
          } else {
            logger?.info(formatTaskHeartbeatLine(taskNumber, stats));
          }
        })
        .catch(() => {});
    }, tickIntervalMs);
    heartbeatTimer.unref();
  }

  try {
    const spawnStartMs = startTime;
    const timeoutSeconds = config.timeouts.taskTimeoutSeconds;

    // The runner alone owns lifecycle events. `started` is emitted the moment
    // the child process exists via `onSpawn`, not after the adapter resolves.
    let startedRecorded = false;
    let startedPromise: Promise<void> | null = null;

    const recordStarted = (pid: number | undefined): Promise<void> => {
      if (startedRecorded) {
        return startedPromise ?? Promise.resolve();
      }
      startedRecorded = true;
      startedPromise = (async () => {
        // Build identity is recorded with the event so a later reader can tell
        // which osq version/commit produced this run.
        const buildInfo = await resolveBuildInfo(projectRoot);
        await recordLifecycleEvent(
          specFolderPath,
          taskNumber,
          {
            type: 'started',
            timestamp: new Date().toISOString(),
            data: {
              pid,
              timeoutSeconds,
              version: buildInfo.version,
              commit: buildInfo.commit,
            },
          },
          formatTaskStartedLine(taskNumber, taskData.title, pid, timeoutSeconds, useSymbols),
          logger,
        );
      })();
      return startedPromise;
    };

    // Fingerprint preexisting tests before the agent runs. A task that declares
    // `tests.modify: true` is allowed to edit them, so no snapshot is taken.
    const testSnapshot = taskData.testsModify ? null : await snapshotTestFiles(projectRoot);

    const spawnResult = await adapter.spawn({
      projectRoot,
      specFolderPath,
      taskNumber,
      taskTitle: taskData.title,
      verifyCommand: taskData.verify,
      scope: taskData.scope,
      entry: taskData.entry,
      skills: taskData.skills,
      tier: 'coding',
      timeoutSeconds,
      config,
      onSpawn: (pid) => recordStarted(pid),
    });

    // Fallback: an adapter that never invokes onSpawn (or a spawn that fails
    // before the callback) still yields exactly one `started` event.
    await recordStarted(spawnResult.pid);

    const elapsedMs = spawnResult.elapsedMs ?? Date.now() - spawnStartMs;
    const elapsedSeconds = Number((elapsedMs / 1000).toFixed(1));

    await recordLifecycleEvent(
      specFolderPath,
      taskNumber,
      {
        type: 'exited',
        timestamp: new Date().toISOString(),
        data: {
          exitCode: spawnResult.exitCode,
          pid: spawnResult.pid,
          signal: spawnResult.signal ?? undefined,
          timedOut: spawnResult.timedOut,
          elapsedSeconds,
        },
      },
      `task ${taskNumber} exited (code: ${spawnResult.exitCode}, elapsed: ${elapsedSeconds}s)`,
      logger,
      'verbose',
    );

    if (spawnResult.exitCode !== 0 || spawnResult.timedOut) {
      const failureReason: RunTaskFailureReason = spawnResult.timedOut ? 'timeout' : 'crashed';
      await fs.mkdir(deadDir, { recursive: true });
      const deadMarkerLines = [
        '---',
        `reason: ${failureReason}`,
        `exit_code: ${spawnResult.exitCode}`,
      ];
      if (spawnResult.signal) {
        deadMarkerLines.push(`signal: ${spawnResult.signal}`);
      }
      deadMarkerLines.push('---');
      deadMarkerLines.push(
        `Agent ${spawnResult.timedOut ? 'timed out' : 'crashed'} with code ${spawnResult.exitCode}: ${spawnResult.error || ''}\n`,
      );

      await fs.writeFile(
        path.join(deadDir, `${taskNumber}.md`),
        deadMarkerLines.join('\n'),
        'utf8',
      );
      await recordDeadEvent(specFolderPath, taskNumber, failureReason);
      logOutcome(
        false,
        failureReason,
        failureReason === 'crashed' ? `code: ${spawnResult.exitCode}` : undefined,
      );
      return {
        success: false,
        reason: failureReason,
        error: spawnResult.error || `Agent exited with code ${spawnResult.exitCode}`,
      };
    }

    // Test modification gating: the agent may freely add new tests, but editing
    // or deleting a preexisting test requires an explicit declaration. This is
    // checked before the result/verify pipeline so an undeclared change halts
    // the task without ever invoking the task's verify command.
    if (testSnapshot) {
      const undeclared = await findUndeclaredTestChanges(projectRoot, testSnapshot);
      if (undeclared.length > 0) {
        await fs.mkdir(deadDir, { recursive: true });
        const deadLines = [
          '---',
          'reason: undeclared_test_change',
          '---',
          'Preexisting test files were modified or deleted without tests.modify: true:',
          ...undeclared.map((file) => `- ${file}`),
          '',
        ];
        await fs.writeFile(path.join(deadDir, `${taskNumber}.md`), deadLines.join('\n'), 'utf8');
        await recordDeadEvent(specFolderPath, taskNumber, 'undeclared_test_change');
        logOutcome(false, 'undeclared_test_change');
        return {
          success: false,
          reason: 'undeclared_test_change',
          error: `Undeclared test changes: ${undeclared.join(', ')}`,
        };
      }
    }

    const resultPath = path.join(runDir, 'results', `${taskNumber}.md`);
    let hasResult = false;
    try {
      await fs.stat(resultPath);
      hasResult = true;
    } catch {}

    if (!hasResult) {
      const finalText = await extractFinalTextFromStream(specFolderPath, taskNumber);

      if (finalText) {
        await synthesizeResultFile(path.join(runDir, 'results'), taskNumber, finalText);
        await appendHarnessEvent(specFolderPath, taskNumber, {
          type: 'result_written',
          timestamp: new Date().toISOString(),
          data: { path: resultPath, synthesized: true },
        });
        logger?.verbose(`task ${taskNumber} result synthesized from agent message`);
      } else {
        await fs.mkdir(deadDir, { recursive: true });
        await fs.writeFile(
          path.join(deadDir, `${taskNumber}.md`),
          `---\nreason: no_result\n---\nAgent exited without writing result file at .run/results/${taskNumber}.md and produced no final text.\n`,
          'utf8',
        );
        await recordDeadEvent(specFolderPath, taskNumber, 'no_result');
        logOutcome(false, 'no_result');
        return {
          success: false,
          reason: 'no_result',
          error: `Agent exited without writing .run/results/${taskNumber}.md`,
        };
      }
    }

    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'verify_ran',
      timestamp: new Date().toISOString(),
      data: { command: taskData.verify },
    });

    const verifyTimeoutMs = (config.timeouts.verifyTimeoutSeconds ?? 600) * 1000;
    let verifyTimedOut = false;

    const verifyPromise = new Promise<void>((resolve, reject) => {
      const child = spawn(taskData.verify, {
        cwd: projectRoot,
        shell: true,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let timer: NodeJS.Timeout | null = null;
      let killTimer: NodeJS.Timeout | null = null;

      if (verifyTimeoutMs > 0) {
        timer = setTimeout(() => {
          verifyTimedOut = true;
          const childPid = child.pid;
          if (childPid) {
            try {
              process.kill(-childPid, 'SIGTERM');
            } catch {
              try {
                child.kill('SIGTERM');
              } catch {}
            }
            killTimer = setTimeout(() => {
              try {
                process.kill(-childPid, 'SIGKILL');
              } catch {
                try {
                  child.kill('SIGKILL');
                } catch {}
              }
            }, 5000);
          }
        }, verifyTimeoutMs);
      }

      let stderr = '';
      let stdout = '';
      child.stderr?.on('data', (d) => {
        stderr += d.toString();
      });
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });

      child.on('error', (err) => {
        if (timer) clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        reject(err);
      });

      child.on('close', (code) => {
        if (timer) clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        if (verifyTimedOut) {
          reject(
            new Error(
              `Verify command timed out after ${config.timeouts.verifyTimeoutSeconds ?? 600}s`,
            ),
          );
        } else if (code !== 0) {
          reject(new Error(stderr || stdout || `Process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    });

    try {
      await verifyPromise;
    } catch (verifyErr) {
      const msg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
      await fs.mkdir(deadDir, { recursive: true });
      const deadLines = ['---', 'reason: verify_red'];
      if (verifyTimedOut) {
        deadLines.push('timed_out: true');
      }
      deadLines.push(`command: "${taskData.verify}"`);
      deadLines.push('---');
      deadLines.push(
        `Watcher independent verify ${verifyTimedOut ? 'timed out' : 'failed'}:\n${msg}\n`,
      );

      await fs.writeFile(path.join(deadDir, `${taskNumber}.md`), deadLines.join('\n'), 'utf8');
      await recordDeadEvent(specFolderPath, taskNumber, 'verify_red');
      logOutcome(false, 'verify_red', verifyTimedOut ? 'timed_out: true' : undefined);
      return {
        success: false,
        reason: 'verify_red',
        error: `Verify failed: ${msg}`,
      };
    }

    try {
      await fs.unlink(path.join(deadDir, `${taskNumber}.md`));
    } catch {}

    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(path.join(doneDir, taskNumber), `${new Date().toISOString()}\n`, 'utf8');
    await recordDoneEvent(specFolderPath, taskNumber);
    logOutcome(true);

    await tickTaskCheckbox(specFolderPath, taskNumber);

    return { success: true };
  } finally {
    stopHeartbeat();
    clearTaskHeartbeatStats(specFolderPath, taskNumber);
    await releaseLock(runDir, taskNumber);
  }
}
