/**
 * The focused scenario-test run the watcher makes after an agent exits and
 * before the task verify. A failing collected scenario ends the attempt as a
 * `verify_red` death; anything else lets the full verify decide completion.
 */

import { collectFocusedTests, runFocusedTests } from '../core/run/focused-tests.js';
import { appendHarnessEvent } from '../harness/types.js';
import type { RunTaskResult } from './outcome.js';
import type { FailFn, TaskVerifyOptions } from './task-verify.js';

/** Dead marker for a task whose focused scenario tests failed: reason, flag, command, output. */
function formatFocusedDeadMarker(command: string, output: string): string {
  const body = output === '' || output.endsWith('\n') ? output : `${output}\n`;
  return [
    '---',
    'reason: verify_red',
    'focused: true',
    `command: "${command}"`,
    '---',
    'Watcher focused scenario tests failed:',
    body,
  ].join('\n');
}

/**
 * The last check of `checkBlockedFirst`. Collects the task's focused scenarios
 * and files, runs the configured command through `runFocusedTests`, and appends
 * one `focused_ran` event with the run's command, inputs, outcome, and output.
 * Returns the `verify_red` death when a collected scenario test failed, and
 * null when there is nothing to run or the run passed or was a problem, so the
 * verify still runs and alone decides the task.
 */
export async function checkFocusedTests(
  options: TaskVerifyOptions,
  fail: FailFn,
): Promise<RunTaskResult | null> {
  const { projectRoot, specFolderPath, taskNumber, taskData, config } = options;
  const collection = await collectFocusedTests(projectRoot, config, taskData.scope);
  const run = await runFocusedTests(collection, projectRoot, specFolderPath, config);
  if (run === null) return null;

  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'focused_ran',
    timestamp: new Date().toISOString(),
    data: {
      command: run.command,
      files: [...run.files],
      scenarios: [...run.scenarios],
      outcome: run.outcome,
      exitCode: run.exitCode,
      duration: run.duration,
      timedOut: run.timedOut,
      output: run.output,
    },
  });

  if (run.outcome !== 'failed') return null;
  const error = 'Watcher focused scenario tests failed';
  return fail('verify_red', formatFocusedDeadMarker(run.command, run.output), error);
}
