import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import type { VerificationResult } from '../core/run/verification.js';
import type { TaskData, VerifyStarts } from '../core/spec/parser.js';
import { missingNamedPaths } from '../core/spec/verify-paths.js';
import { readRetryContext } from './attempt.js';
import type { RunTaskFailureReason, RunTaskResult } from './outcome.js';
import { runVerificationGateResult } from './verify.js';

/** The runner's `fail` helper, injected so this module owns the marker text. */
export type FailFn = (
  reason: RunTaskFailureReason,
  marker: string,
  error: string,
  extra?: string,
) => Promise<RunTaskResult>;

/**
 * True when a first-attempt declared start state disagrees with the observed
 * result. A `red` verify that passes only because a named path is absent is not
 * a mismatch: the honest red start has not been observed yet.
 */
export function isPreSpawnMismatch(
  expected: VerifyStarts,
  result: VerificationResult,
  missingPaths: readonly string[] = [],
): boolean {
  if (expected === 'any') return false;
  const passed = result.exitCode === 0 && !result.error && !result.timedOut;
  return expected === 'red' ? passed && missingPaths.length === 0 : !passed;
}

/** One warning line naming the task, its expected start state, and exit code. */
export function formatPreSpawnWarning(
  taskNumber: string,
  expected: VerifyStarts,
  exitCode: number,
): string {
  return `task ${taskNumber} pre-spawn verify mismatch: expected ${expected}, exit code ${exitCode}`;
}

/** Dead marker for a pre-spawn mismatch: reason, command, expected state, exit, output. */
export function formatPreSpawnDeadMarker(
  verifyCommand: string,
  expected: VerifyStarts,
  result: VerificationResult,
): string {
  return [
    '---',
    'reason: verify_precondition',
    `command: "${verifyCommand}"`,
    `expected: ${expected}`,
    `exit_code: ${result.exitCode}`,
    '---',
    `Pre-spawn verify precondition not met (expected ${expected}, exit code ${result.exitCode}):`,
    result.output,
    '',
  ].join('\n');
}

export interface TaskVerifyOptions {
  projectRoot: string;
  specFolderPath: string;
  taskNumber: string;
  taskData: TaskData;
  config: OsqConfig;
  logger?: Logger;
}

export type PreSpawnVerifyOutcome = { ok: true } | { ok: false; marker: string; error: string };

/**
 * Run a task's verify once before its first attempt. The attempt comes from
 * `readRetryContext`, so retries and requeued recertifications skip the check,
 * and archive-time and scope-audit verification never reach here. The run goes
 * through the single watcher verification entrypoint with the pre-spawn fields.
 */
export async function runPreSpawnVerify(
  options: TaskVerifyOptions,
): Promise<PreSpawnVerifyOutcome> {
  const { projectRoot, specFolderPath, taskNumber, taskData, config, logger } = options;
  const mode = config.gates?.preSpawnVerify ?? 'warn';
  if (mode === 'off') return { ok: true };
  const { attempt } = await readRetryContext(specFolderPath, taskNumber);
  if (attempt !== 1) return { ok: true };

  const expected = taskData.verifyStarts;
  const missingPaths = await missingNamedPaths(projectRoot, taskData.verify);
  const result = await runVerificationGateResult(
    projectRoot,
    taskData.verify,
    config.timeouts.verifyTimeoutSeconds ?? 600,
    {
      specFolderPath,
      taskNumber,
      extraData: (value) => ({
        phase: 'pre_spawn',
        expected,
        ...(missingPaths.length > 0 ? { missingPaths } : {}),
        mismatch: isPreSpawnMismatch(expected, value, missingPaths),
      }),
    },
  );
  if (!isPreSpawnMismatch(expected, result, missingPaths)) return { ok: true };
  if (mode === 'warn') {
    logger?.warn(formatPreSpawnWarning(taskNumber, expected, result.exitCode));
    return { ok: true };
  }
  return {
    ok: false,
    marker: formatPreSpawnDeadMarker(taskData.verify, expected, result),
    error: `Pre-spawn verify precondition not met: expected ${expected}, exit code ${result.exitCode}`,
  };
}

/**
 * Dead marker for a verify that names a path the tree does not contain: the
 * reason and quoted command in frontmatter, then one line per missing path.
 */
export function formatMissingPathDeadMarker(
  verifyCommand: string,
  missingPaths: readonly string[],
): string {
  return [
    '---',
    'reason: verify_path_missing',
    `command: "${verifyCommand}"`,
    '---',
    'The task verify names paths that do not exist:',
    ...missingPaths.map((missing) => `- ${missing}`),
    '',
  ].join('\n');
}

/**
 * After the agent exits and its result is ensured, refuse to run a verify that
 * names a missing path. Returns null when every named path exists, so a command
 * that names none always proceeds.
 */
export async function checkMissingVerifyPaths(
  projectRoot: string,
  taskData: TaskData,
  fail: FailFn,
): Promise<RunTaskResult | null> {
  const missing = await missingNamedPaths(projectRoot, taskData.verify);
  if (missing.length === 0) return null;
  return fail(
    'verify_path_missing',
    formatMissingPathDeadMarker(taskData.verify, missing),
    `Verify names missing paths: ${missing.join(', ')}`,
  );
}

/**
 * The `verify_red` dead marker and failure result for a failing task verify.
 * The marker text moved here unchanged from `runTask`.
 */
export function verifyRedFailure(
  verifyCommand: string,
  result: { readonly error?: string; readonly timedOut: boolean },
  fail: FailFn,
): Promise<RunTaskResult> {
  const msg = result.error ?? 'Verify command failed';
  const timeoutLine = result.timedOut ? 'timed_out: true\n' : '';
  const marker = `---\nreason: verify_red\n${timeoutLine}command: "${verifyCommand}"\n---\nWatcher independent verify ${result.timedOut ? 'timed out' : 'failed'}:\n${msg}\n`;
  const extra = result.timedOut ? 'timed_out: true' : undefined;
  return fail('verify_red', marker, `Verify failed: ${msg}`, extra);
}
