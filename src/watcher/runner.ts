import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { hashChangeFolder } from '../core/hasher.js';
import type { Logger } from '../core/logger.js';
import { parseTaskMd } from '../core/parser.js';
import type { HarnessAdapter } from '../harness/types.js';
import { runChangeVerifyGate } from './change-verify.js';
import {
  clearTaskHeartbeatStats,
  computeTaskHeartbeatStats,
  formatTaskHeartbeatLine,
  formatTaskStatusRow,
} from './heartbeat.js';
import { acquireTaskLock, releaseTaskLock } from './lock.js';
import { createTaskMeasures } from './measures.js';
import {
  type RunTaskFailureReason,
  type RunTaskResult,
  formatTaskOutcomeLine,
  recordDeadEvent,
  recordDoneEvent,
  tickTaskCheckbox,
  writeDeadMarker,
  writeDoneMarker,
} from './outcome.js';
import { buildDoneMetadata, guardScopeRegression } from './regression.js';
import { ensureTaskResult, spawnTaskAgent } from './spawn.js';
import { captureTestGate, findUndeclaredTestChanges, runVerificationGate } from './verify.js';

export type { RunTaskFailureReason, RunTaskResult } from './outcome.js';

/** Top-level sequential task pipeline; each phase delegates to its lifecycle module. */
export async function runTask(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
  config: OsqConfig,
  adapter: HarnessAdapter,
  logger?: Logger,
): Promise<RunTaskResult> {
  const runDir = path.join(specFolderPath, '.run');
  const startTime = Date.now();
  const useSymbols = logger?.symbols === true;
  const interactive = logger?.interactive === true;
  const heartbeatIntervalMs = (config.log?.heartbeatSeconds ?? 60) * 1000;
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let heartbeatActive = true;
  let lastHeartbeatLogAt = startTime;

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

  let measures: ReturnType<typeof createTaskMeasures> | null = null;
  const finish = (result: RunTaskResult): Promise<RunTaskResult> =>
    measures ? measures.emitEnd().then(() => result) : Promise.resolve(result);
  const fail = async (
    reason: RunTaskFailureReason,
    marker: string,
    error: string,
    extra?: string,
  ): Promise<RunTaskResult> => {
    await measures?.emitEnd();
    await writeDeadMarker(runDir, taskNumber, marker);
    await recordDeadEvent(specFolderPath, taskNumber, reason);
    logOutcome(false, reason, extra);
    return { success: false, reason, error };
  };

  let approvedHash = '';
  try {
    approvedHash = (await fs.readFile(path.join(runDir, 'approved'), 'utf8')).trim();
  } catch {
    const marker =
      '---\nreason: spec_conflict\n---\nSpec has not been approved (missing .run/approved).\n';
    return fail('spec_conflict', marker, 'Missing .run/approved');
  }

  const currentHash = await hashChangeFolder(specFolderPath);
  if (currentHash !== approvedHash) {
    const marker = `---\nreason: spec_conflict\napproved_hash: "${approvedHash}"\ncurrent_hash: "${currentHash}"\n---\nChange folder modified after approval. Expected ${approvedHash}, computed ${currentHash}.\n`;
    const error = `Folder hash mismatch: expected ${approvedHash}, got ${currentHash}`;
    return fail('spec_conflict', marker, error);
  }

  const taskPath = path.join(specFolderPath, 'tasks', `${taskNumber}.md`);
  let taskContent = '';
  try {
    taskContent = await fs.readFile(taskPath, 'utf8');
  } catch {
    const marker = `---\nreason: crashed\n---\nTask file not found: ${taskPath}\n`;
    return fail('crashed', marker, 'Task file not found');
  }
  const taskData = parseTaskMd(taskContent);

  const regression = await guardScopeRegression(projectRoot, specFolderPath, taskNumber, config);
  if (regression) {
    logOutcome(false, 'regressed', regression.error);
    return regression;
  }
  const lockResult = await acquireTaskLock(runDir, taskNumber);
  if (!lockResult.acquired) {
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
    const testGate = await captureTestGate(projectRoot, taskData.scope, taskData.testsModify);
    measures = createTaskMeasures(projectRoot, specFolderPath, taskNumber, taskData);
    await measures.emitStart();
    const spawnOutcome = await spawnTaskAgent({
      projectRoot,
      specFolderPath,
      taskNumber,
      taskData,
      config,
      adapter,
      logger,
      logOutcome,
    });
    if (!spawnOutcome.ok) return finish(spawnOutcome.result);

    const undeclared = await findUndeclaredTestChanges(projectRoot, testGate.snapshot, testGate);
    if (undeclared.length > 0) {
      const marker = `---\nreason: undeclared_test_change\n---\nPreexisting test files were modified or deleted without both tests.modify: true and an authorizing scope entry:\n${undeclared.map((file) => `- ${file}`).join('\n')}\n`;
      const error = `Undeclared test changes: ${undeclared.join(', ')}`;
      return fail('undeclared_test_change', marker, error);
    }

    const ensured = await ensureTaskResult({ specFolderPath, taskNumber, logger, logOutcome });
    if (!ensured.ok) return finish(ensured.result);

    const verifyResult = await runVerificationGate(
      projectRoot,
      taskData.verify,
      config.timeouts.verifyTimeoutSeconds ?? 600,
      { specFolderPath, taskNumber },
    );
    if (!verifyResult.passed) {
      const msg = verifyResult.error ?? 'Verify command failed';
      const timeoutLine = verifyResult.timedOut ? 'timed_out: true\n' : '';
      const marker = `---\nreason: verify_red\n${timeoutLine}command: "${taskData.verify}"\n---\nWatcher independent verify ${verifyResult.timedOut ? 'timed out' : 'failed'}:\n${msg}\n`;
      const extra = verifyResult.timedOut ? 'timed_out: true' : undefined;
      return fail('verify_red', marker, `Verify failed: ${msg}`, extra);
    }

    const gate = await runChangeVerifyGate(projectRoot, specFolderPath, config);
    if (!gate.ok) return fail('change_verify_red', gate.marker, gate.error, gate.extra);

    await measures.emitEnd();
    await writeDoneMarker(runDir, taskNumber, await buildDoneMetadata(projectRoot, taskData.scope));
    await recordDoneEvent(specFolderPath, taskNumber);
    logOutcome(true);
    await tickTaskCheckbox(specFolderPath, taskNumber);
    return { success: true };
  } finally {
    stopHeartbeat();
    clearTaskHeartbeatStats(specFolderPath, taskNumber);
    await releaseTaskLock(runDir, taskNumber);
  }
}
