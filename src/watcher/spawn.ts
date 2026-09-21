import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { resolveExecutorIdentity } from '../core/harness-catalog.js';
import type { Logger } from '../core/logger.js';
import type { TaskData } from '../core/parser.js';
import { type HarnessAdapter, appendHarnessEvent } from '../harness/types.js';
import { formatTaskStartedLine, readRetryContext } from './attempt.js';
import { resolveBuildInfo } from './build.js';
import {
  type RunTaskFailureReason,
  type RunTaskResult,
  recordDeadEvent,
  recordLifecycleEvent,
  writeDeadMarker,
} from './outcome.js';
import { extractFinalTextFromStream, synthesizeResultFile } from './verify.js';

export interface SpawnTaskAgentOptions {
  projectRoot: string;
  specFolderPath: string;
  taskNumber: string;
  taskData: TaskData;
  config: OsqConfig;
  adapter: HarnessAdapter;
  logger?: Logger;
  logOutcome: (success: boolean, reason?: RunTaskFailureReason, extra?: string) => void;
}

export type SpawnTaskAgentOutcome =
  | { ok: true; elapsedMs: number }
  | { ok: false; result: RunTaskResult };

/**
 * Spawn the coding agent for a task and own the process lifecycle events. The
 * `started` event is emitted the moment the child process exists via `onSpawn`.
 * A crash or timeout is persisted as a dead marker and dead event before the
 * failure result is returned.
 */
export async function spawnTaskAgent(opts: SpawnTaskAgentOptions): Promise<SpawnTaskAgentOutcome> {
  const { projectRoot, specFolderPath, taskNumber, taskData } = opts;
  const { config, adapter, logger, logOutcome } = opts;
  const runDir = path.join(specFolderPath, '.run');
  const timeoutSeconds = config.timeouts.taskTimeoutSeconds;
  const useSymbols = logger?.symbols === true;
  // Reconstruct retry context from append-only state before any spawn so a
  // watcher restart still carries the attempt and prior failure reason.
  const retryContext = await readRetryContext(specFolderPath, taskNumber);

  let startedRecorded = false;
  let startedPromise: Promise<void> | null = null;
  const recordStarted = (pid: number | undefined): Promise<void> => {
    if (startedRecorded) return startedPromise ?? Promise.resolve();
    startedRecorded = true;
    startedPromise = (async () => {
      const buildInfo = await resolveBuildInfo(projectRoot);
      const { model } = resolveExecutorIdentity(config);
      await recordLifecycleEvent(
        specFolderPath,
        taskNumber,
        {
          type: 'started',
          timestamp: new Date().toISOString(),
          data: {
            harness: adapter.name,
            model,
            osqVersion: buildInfo.version,
            attempt: retryContext.attempt,
            pid,
            timeoutSeconds,
            ...buildInfo,
          },
        },
        formatTaskStartedLine(taskNumber, taskData.title, pid, timeoutSeconds, useSymbols),
        logger,
      );
    })();
    return startedPromise;
  };
  const spawnStartMs = Date.now();
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
    attempt: retryContext.attempt,
    priorFailureReason: retryContext.reason,
    onSpawn: (pid) => recordStarted(pid),
  });
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
    const lines = ['---', `reason: ${failureReason}`, `exit_code: ${spawnResult.exitCode}`];
    if (spawnResult.signal) lines.push(`signal: ${spawnResult.signal}`);
    lines.push('---');
    lines.push(
      `Agent ${spawnResult.timedOut ? 'timed out' : 'crashed'} with code ${spawnResult.exitCode}: ${spawnResult.error || ''}\n`,
    );
    await writeDeadMarker(runDir, taskNumber, lines.join('\n'));
    await recordDeadEvent(specFolderPath, taskNumber, failureReason);
    const extra = failureReason === 'crashed' ? `code: ${spawnResult.exitCode}` : undefined;
    logOutcome(false, failureReason, extra);
    const error = spawnResult.error || `Agent exited with code ${spawnResult.exitCode}`;
    return { ok: false, result: { success: false, reason: failureReason, error } };
  }

  return { ok: true, elapsedMs };
}

export interface EnsureTaskResultOptions {
  specFolderPath: string;
  taskNumber: string;
  logger?: Logger;
  logOutcome: (success: boolean, reason?: RunTaskFailureReason, extra?: string) => void;
}

export type EnsureTaskResultOutcome = { ok: true } | { ok: false; result: RunTaskResult };

/**
 * Ensure a result file exists after the agent exits, synthesizing one from the
 * agent's final stream message when possible. Returns a `no_result` failure
 * result when neither the file nor any final text is present.
 */
export async function ensureTaskResult(
  opts: EnsureTaskResultOptions,
): Promise<EnsureTaskResultOutcome> {
  const { specFolderPath, taskNumber, logger, logOutcome } = opts;
  const runDir = path.join(specFolderPath, '.run');
  const resultPath = path.join(runDir, 'results', `${taskNumber}.md`);
  const exists = await fs
    .stat(resultPath)
    .then(() => true)
    .catch(() => false);
  if (exists) return { ok: true };

  const finalText = await extractFinalTextFromStream(specFolderPath, taskNumber);
  if (!finalText) {
    await writeDeadMarker(
      runDir,
      taskNumber,
      `---\nreason: no_result\n---\nAgent exited without writing result file at .run/results/${taskNumber}.md and produced no final text.\n`,
    );
    await recordDeadEvent(specFolderPath, taskNumber, 'no_result');
    logOutcome(false, 'no_result');
    const error = `Agent exited without writing .run/results/${taskNumber}.md`;
    return { ok: false, result: { success: false, reason: 'no_result', error } };
  }

  await synthesizeResultFile(path.join(runDir, 'results'), taskNumber, finalText);
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'result_written',
    timestamp: new Date().toISOString(),
    data: { path: resultPath, synthesized: true },
  });
  logger?.verbose(`task ${taskNumber} result synthesized from agent message`);
  return { ok: true };
}
