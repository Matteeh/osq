import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { hashChangeFolder } from '../core/hasher.js';
import { acquireLock, releaseLock } from '../core/lock.js';
import type { Logger } from '../core/logger.js';
import { parseTaskMd } from '../core/parser.js';
import { asRecord } from '../harness/stream.js';
import {
  type DeadEventData,
  type DoneEventData,
  type HarnessAdapter,
  type HarnessEvent,
  appendHarnessEvent,
} from '../harness/types.js';

export type RunTaskFailureReason =
  | 'spec_conflict'
  | 'already_running'
  | 'no_result'
  | 'verify_red'
  | 'crashed'
  | 'timeout';

export interface RunTaskResult {
  success: boolean;
  reason?: RunTaskFailureReason;
  error?: string;
}

/**
 * Single-line, human-readable summary of a task outcome. Kept pure so the exact
 * shape can be tested without running the runner, and used directly beside every
 * marker write (`done/<n>` or `dead/<n>.md`) so the log and the marker agree.
 */
export function formatTaskOutcomeSummary(
  taskNumber: string,
  success: boolean,
  reason?: RunTaskFailureReason,
  extra?: string,
): string {
  if (success) {
    return `task ${taskNumber} verified (passed)`;
  }

  const detail = extra ? `, ${extra}` : '';
  return `task ${taskNumber} dead (reason: ${reason}${detail})`;
}

export async function tickTaskCheckbox(specFolderPath: string, taskNumber: string): Promise<void> {
  const tasksMdPath = path.join(specFolderPath, 'tasks.md');
  let content = '';
  try {
    content = await fs.readFile(tasksMdPath, 'utf8');
  } catch {
    return;
  }

  const regex = new RegExp(`^(\\s*-\\s*\\[)[ ](\\]\\s*${taskNumber}\\b.*)$`, 'm');
  const updated = content.replace(regex, '$1x$2');

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
): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, event);
  logger?.info(summary);
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
}

/**
 * Snapshot of task progress read straight from the append-only event stream.
 * The event file may not exist yet, in which case counters are zero.
 */
export async function computeTaskHeartbeatStats(
  specFolderPath: string,
  taskNumber: string,
  startTime: number,
): Promise<TaskHeartbeatStats> {
  const elapsedSeconds = Number(((Date.now() - startTime) / 1000).toFixed(1));
  const eventFilePath = path.join(specFolderPath, '.run', 'events', `${taskNumber}.jsonl`);

  let content = '';
  try {
    content = await fs.readFile(eventFilePath, 'utf8');
  } catch {
    return { elapsedSeconds, eventCount: 0, totalTokens: 0 };
  }

  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  let totalTokens = 0;

  for (const line of lines) {
    try {
      const event = asRecord(JSON.parse(line));
      if (event?.type !== 'tokens') {
        continue;
      }
      const data = asRecord(event.data);
      totalTokens += Number(data?.totalTokens ?? 0) || 0;
    } catch {
      // Ignore malformed lines rather than losing the whole heartbeat.
    }
  }

  return { elapsedSeconds, eventCount: lines.length, totalTokens };
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
    logger?.info(formatTaskOutcomeSummary(taskNumber, false, 'spec_conflict'));
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
    logger?.info(formatTaskOutcomeSummary(taskNumber, false, 'spec_conflict'));
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
    logger?.info(formatTaskOutcomeSummary(taskNumber, false, 'crashed'));
    return { success: false, reason: 'crashed', error: 'Task file not found' };
  }
  const taskData = parseTaskMd(taskContent);

  const lockResult = await acquireLock(runDir, taskNumber);
  if (!lockResult.acquired) {
    // A lock collision means another process is actively running this task, not
    // that the task failed. It writes no dead marker, so it must not append a
    // dead event either; only a dead marker write may record a dead event.
    logger?.info(formatTaskOutcomeSummary(taskNumber, false, 'already_running'));
    return { success: false, reason: 'already_running', error: 'Task is already running' };
  }

  const startTime = Date.now();
  const heartbeatSeconds = config.log?.heartbeatSeconds ?? 60;
  const heartbeatIntervalMs = heartbeatSeconds * 1000;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let heartbeatActive = true;

  if (heartbeatIntervalMs > 0) {
    heartbeatTimer = setInterval(() => {
      computeTaskHeartbeatStats(specFolderPath, taskNumber, startTime)
        .then((stats) => {
          if (!heartbeatActive) return;
          logger?.info(
            `task ${taskNumber} heartbeat (elapsed: ${stats.elapsedSeconds}s, events: ${stats.eventCount}, tokens: ${stats.totalTokens})`,
          );
        })
        .catch(() => {});
    }, heartbeatIntervalMs);
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
      startedPromise = recordLifecycleEvent(
        specFolderPath,
        taskNumber,
        {
          type: 'started',
          timestamp: new Date().toISOString(),
          data: { pid, timeoutSeconds },
        },
        `task ${taskNumber} started (pid: ${pid ?? 'unknown'}, timeout: ${timeoutSeconds}s)`,
        logger,
      );
      return startedPromise;
    };

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
      logger?.info(
        formatTaskOutcomeSummary(
          taskNumber,
          false,
          failureReason,
          failureReason === 'crashed' ? `code: ${spawnResult.exitCode}` : undefined,
        ),
      );
      return {
        success: false,
        reason: failureReason,
        error: spawnResult.error || `Agent exited with code ${spawnResult.exitCode}`,
      };
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
        logger?.info(`task ${taskNumber} result synthesized from agent message`);
      } else {
        await fs.mkdir(deadDir, { recursive: true });
        await fs.writeFile(
          path.join(deadDir, `${taskNumber}.md`),
          `---\nreason: no_result\n---\nAgent exited without writing result file at .run/results/${taskNumber}.md and produced no final text.\n`,
          'utf8',
        );
        await recordDeadEvent(specFolderPath, taskNumber, 'no_result');
        logger?.info(formatTaskOutcomeSummary(taskNumber, false, 'no_result'));
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
      logger?.info(
        formatTaskOutcomeSummary(
          taskNumber,
          false,
          'verify_red',
          verifyTimedOut ? 'timed_out: true' : undefined,
        ),
      );
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
    logger?.info(formatTaskOutcomeSummary(taskNumber, true));

    await tickTaskCheckbox(specFolderPath, taskNumber);

    return { success: true };
  } finally {
    heartbeatActive = false;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    await releaseLock(runDir, taskNumber);
  }
}
