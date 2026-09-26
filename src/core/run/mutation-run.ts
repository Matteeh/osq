/**
 * Run one mutation pick: substitute the command's placeholders, run it through
 * `runVerificationCommand` with the pick's environment, read the report, and
 * return the outcome. The temporary folder is always removed. Nothing here
 * blocks a task.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { MutationPick } from '../trace/mutation-pick.js';
import { type MutationSurvivor, readMutationReport } from './mutation-report.js';
import { runVerificationCommand } from './verification.js';

/** Why a pick was not measured. */
export type MutationNotMeasuredReason =
  | 'range_unknown'
  | 'timed_out'
  | 'command_failed'
  | 'report_invalid';

/** One pick's outcome, counts, survivors, and process evidence. */
export interface MutationRunResult {
  readonly outcome: 'measured' | 'not_measured';
  readonly reason?: MutationNotMeasuredReason;
  readonly killed: number;
  readonly survived: number;
  readonly invalid: number;
  readonly survivors: readonly MutationSurvivor[];
  readonly duration: number;
  readonly exitCode: number | null;
  readonly output: string;
}

/** The last 2,000 characters of a command's output. */
function boundOutput(output: string): string {
  return output.length > 2000 ? output.slice(-2000) : output;
}

/** A not-measured result with zero counts and no survivors. */
function notMeasured(
  reason: MutationNotMeasuredReason,
  exitCode: number | null,
  duration: number,
  output: string,
): MutationRunResult {
  return {
    outcome: 'not_measured',
    reason,
    killed: 0,
    survived: 0,
    invalid: 0,
    survivors: [],
    duration,
    exitCode,
    output,
  };
}

/** Replace `{mutate}`, `{tests}`, and `{report}` with the pick's shell-ready values. */
function resolveCommand(pick: MutationPick, command: string, reportPath: string): string {
  const ranges = pick.ranges ?? [];
  const tests = pick.tests.map((test) => `'${test}'`).join(' ');
  return command
    .replace(/\{mutate\}/g, ranges.join(','))
    .replace(/\{tests\}/g, tests)
    .replace(/\{report\}/g, `'${reportPath}'`);
}

/**
 * Run `command` for one pick under `timeoutSeconds`. The ranges and tests go
 * to the placeholders and to `OSQ_MUTATE` and `OSQ_MUTATION_TESTS` as JSON
 * arrays, and the report path to `{report}` and `OSQ_MUTATION_REPORT`. The
 * command also receives `OSQ_CHANGE` through `runVerificationCommand`. A pick
 * whose ranges are unknown is not run. The fresh temporary folder is removed
 * after the report is read, whether or not it was readable.
 */
export async function runMutationPick(
  pick: MutationPick,
  projectRoot: string,
  changeFolder: string,
  command: string,
  timeoutSeconds: number,
): Promise<MutationRunResult> {
  if (pick.ranges === null) return notMeasured('range_unknown', null, 0, '');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-mutation-'));
  const reportPath = path.join(folder, 'mutation.json');
  try {
    const result = await runVerificationCommand(
      projectRoot,
      resolveCommand(pick, command, reportPath),
      timeoutSeconds,
      changeFolder,
      {
        OSQ_MUTATE: JSON.stringify([...pick.ranges]),
        OSQ_MUTATION_TESTS: JSON.stringify([...pick.tests]),
        OSQ_MUTATION_REPORT: reportPath,
      },
    );
    if (result.timedOut) {
      return notMeasured('timed_out', result.exitCode, result.duration, boundOutput(result.output));
    }
    if (result.error !== undefined || result.exitCode !== 0) {
      return notMeasured(
        'command_failed',
        result.exitCode,
        result.duration,
        boundOutput(result.output),
      );
    }
    const counts = readMutationReport(reportPath, pick.file, pick.ranges);
    if (counts === null) {
      return notMeasured(
        'report_invalid',
        result.exitCode,
        result.duration,
        boundOutput(result.output),
      );
    }
    return {
      outcome: 'measured',
      ...counts,
      duration: result.duration,
      exitCode: result.exitCode,
      output: result.output,
    };
  } finally {
    await fs.rm(folder, { recursive: true, force: true });
  }
}
