import fs from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../core/foundation/logger.js';
import { appendHarnessEvent } from '../harness/types.js';
import type { RunTaskFailureReason, RunTaskResult } from './outcome.js';
import { recordDeadEvent, writeDeadMarker } from './outcome.js';
import { extractFinalTextFromStream, synthesizeResultFile } from './verify.js';

export interface EnsureTaskResultOptions {
  specFolderPath: string;
  taskNumber: string;
  logger?: Logger;
  logOutcome: (success: boolean, reason?: RunTaskFailureReason, extra?: string) => void;
}

export type EnsureTaskResultOutcome = { ok: true } | { ok: false; result: RunTaskResult };

/**
 * Filesystem timestamps can trail the process clock by a few milliseconds, so a
 * file written during the attempt can carry a modification time just before
 * the attempt's `Date.now()` start. One second is far below the age of a result
 * file left by an earlier attempt.
 */
const MTIME_CLOCK_TOLERANCE_MS = 1000;

/**
 * Whether the task's result file exists with a modification time at or after
 * `sinceMs`, so it counts as written by the attempt that started then.
 *
 * @scenario watcher-and-harness: Agent exit and result file
 */
export async function resultWrittenSince(
  specFolderPath: string,
  taskNumber: string,
  sinceMs: number,
): Promise<boolean> {
  const resultPath = path.join(specFolderPath, '.run', 'results', `${taskNumber}.md`);
  const stats = await fs.stat(resultPath).catch(() => null);
  return stats !== null && stats.mtimeMs >= sinceMs - MTIME_CLOCK_TOLERANCE_MS;
}

/**
 * Ensure a result file exists, synthesizing one from the agent's final message,
 * or a `no_result` failure when neither is present.
 *
 * @scenario watcher-and-harness: Agent exit and result file
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
