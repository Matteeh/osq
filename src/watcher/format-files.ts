/**
 * The format step the watcher makes after an agent exits and before the focused
 * run and the task's verify. When `gates.formatCommand` is set it runs the
 * command once on the files the task changed in its resolved scope, records one
 * `format_ran` event, and never changes the attempt's outcome: a failing or
 * timed-out command is logged and the verify still decides.
 */

import { runVerificationCommand } from '../core/run/verification.js';
import { tailVerifyOutput } from '../core/run/verify-excerpt.js';
import { appendHarnessEvent } from '../harness/types.js';
import type { TaskVerifyOptions } from './task-verify.js';

/** The warning line a failed or timed-out format run logs, naming the exit code. */
function formatWarning(taskNumber: string, exitCode: number): string {
  return `task ${taskNumber}: format command exited ${exitCode}`;
}

/**
 * Run the configured format command on the task's changed scoped files, replace
 * `{files}` with each path single-quoted and separated by spaces, and append one
 * `format_ran` event whose output is the tail `tailVerifyOutput` keeps. With no
 * command or no changed file nothing runs and nothing is recorded. A failing or
 * timed-out run is logged with its exit code and never ends the attempt; a
 * thrown error is caught and logged the same way.
 */
export async function runFormatFiles(options: TaskVerifyOptions): Promise<void> {
  const { projectRoot, specFolderPath, taskNumber, config, logger, measures } = options;
  const command = config.gates?.formatCommand;
  if (command === undefined) return;
  const files = (await measures?.changedScopeFiles()) ?? [];
  if (files.length === 0) return;
  const resolvedCommand = command.replace(/\{files\}/g, files.map((file) => `'${file}'`).join(' '));
  try {
    const result = await runVerificationCommand(
      projectRoot,
      resolvedCommand,
      config.timeouts.verifyTimeoutSeconds,
      specFolderPath,
      { config },
    );
    const output = tailVerifyOutput(result.output, config.limits);
    await appendHarnessEvent(specFolderPath, taskNumber, {
      type: 'format_ran',
      timestamp: new Date().toISOString(),
      data: {
        command: resolvedCommand,
        files,
        exitCode: result.exitCode,
        duration: result.duration,
        timedOut: result.timedOut,
        ...(output === '' ? {} : { output }),
      },
    });
    if (result.exitCode !== 0 || result.timedOut) {
      logger?.warn(formatWarning(taskNumber, result.exitCode));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger?.warn(formatWarning(taskNumber, 1));
    logger?.verbose(`format command error: ${message}`);
  }
}
