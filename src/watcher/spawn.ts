import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { resolveExecutorIdentity } from '../core/foundation/harness-catalog.js';
import type { Logger } from '../core/foundation/logger.js';
import type { TaskData } from '../core/spec/parser.js';
import type { HarnessAdapter, SpawnDetails } from '../harness/types.js';
import { formatTaskStartedLine, readRetryContext } from './attempt.js';
import { resolveProjectCommit } from './build-project.js';
import { resolveBuildInfo } from './build.js';
import { checkInstructionsDrift } from './instructions-drift.js';
import {
  type RunTaskFailureReason,
  type RunTaskResult,
  recordDeadEvent,
  recordLifecycleEvent,
  writeDeadMarker,
} from './outcome.js';
import { describeAgentFailure } from './provider-outage.js';
import { spawnOrCrash } from './spawn-guard.js';
import { resultWrittenSince } from './task-result.js';
import { pauseTaskOnUsageLimit } from './usage-pause.js';

export {
  type EnsureTaskResultOptions,
  type EnsureTaskResultOutcome,
  ensureTaskResult,
} from './task-result.js';

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
 * Spawn the coding agent for a task and own the process lifecycle events. A
 * crash or timeout is persisted as a dead marker and dead event before the
 * failure result is returned; a usage limit pauses instead.
 *
 * @scenario watcher-and-harness: Limit with a reset time
 * @scenario watcher-and-harness: Limit without a reset time
 * @scenario watcher-and-harness: Limit from an earlier attempt
 * @scenario watcher-and-harness: Agent exit and result file
 */
export async function spawnTaskAgent(opts: SpawnTaskAgentOptions): Promise<SpawnTaskAgentOutcome> {
  const { projectRoot, specFolderPath, taskNumber, taskData } = opts;
  const { config, adapter, logger, logOutcome } = opts;
  const runDir = path.join(specFolderPath, '.run');
  const timeoutSeconds = config.timeouts.taskTimeoutSeconds;
  const useSymbols = logger?.symbols === true;
  const retryContext = await readRetryContext(specFolderPath, taskNumber);
  if (retryContext.attempt === 1) {
    await checkInstructionsDrift({ ...opts, attempt: 1 });
  }
  let startedRecorded = false;
  let startedPromise: Promise<void> | null = null;
  const recordStarted = (pid: number | undefined, details?: SpawnDetails): Promise<void> => {
    if (startedRecorded) return startedPromise ?? Promise.resolve();
    startedRecorded = true;
    startedPromise = (async () => {
      const [buildInfo, projectCommit] = await Promise.all([
        resolveBuildInfo(),
        resolveProjectCommit(projectRoot),
      ]);
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
            projectCommit,
            pid,
            timeoutSeconds,
            ...(details?.harnessVersion ? { harnessVersion: details.harnessVersion } : {}),
            ...(details?.harnessAuth ? { harnessAuth: details.harnessAuth } : {}),
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
  const spawnResult = await spawnOrCrash(adapter, {
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
    ...(retryContext.output ? { priorFailureOutput: retryContext.output } : {}),
    onSpawn: (pid, details) => recordStarted(pid, details),
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

  const paused = await pauseTaskOnUsageLimit(specFolderPath, taskNumber, config, logger);
  if (paused !== null) return { ok: false, result: paused };
  if (spawnResult.exitCode !== 0 && !spawnResult.timedOut) {
    const wroteResult = await resultWrittenSince(specFolderPath, taskNumber, spawnStartMs);
    if (wroteResult) {
      await recordLifecycleEvent(
        specFolderPath,
        taskNumber,
        {
          type: 'exit_continued',
          timestamp: new Date().toISOString(),
          data: { exitCode: spawnResult.exitCode },
        },
        `task ${taskNumber} exited (code: ${spawnResult.exitCode}) after writing its result; judging the task by its checks`,
        logger,
        'verbose',
      );
      return { ok: true, elapsedMs };
    }
  }
  if (spawnResult.exitCode !== 0 || spawnResult.timedOut) {
    const { reason: failureReason, marker } = await describeAgentFailure(
      specFolderPath,
      taskNumber,
      spawnResult,
    );
    await writeDeadMarker(runDir, taskNumber, marker, projectRoot);
    await recordDeadEvent(specFolderPath, taskNumber, failureReason);
    const extra = failureReason === 'crashed' ? `code: ${spawnResult.exitCode}` : undefined;
    logOutcome(false, failureReason, extra);
    const error = spawnResult.error || `Agent exited with code ${spawnResult.exitCode}`;
    return { ok: false, result: { success: false, reason: failureReason, error } };
  }

  return { ok: true, elapsedMs };
}
