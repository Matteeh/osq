import type { OsqConfig } from '../core/foundation/config.js';
import { excerptVerifyOutput } from '../core/run/verify-excerpt.js';
import { parseSpecMdFromFolder } from '../core/spec/parser.js';
import { appendHarnessEvent } from '../harness/types.js';
import { type ChangeVerifyRerunContext, findUnrelatedFailingTests } from './change-verify-rerun.js';
import { type VerificationGateResult, runVerificationGateResult } from './verify.js';

/** Failure evidence for a red change gate; the runner writes it through `fail`. */
export interface ChangeVerifyFailure {
  marker: string;
  error: string;
  extra?: string;
}

export type ChangeVerifyOutcome = { ok: true } | ({ ok: false } & ChangeVerifyFailure);

/** Deterministic marker with reason, command, numeric exit code, timeout, excerpt. */
export function formatChangeVerifyMarker(
  command: string,
  config: OsqConfig,
  result: VerificationGateResult,
): string {
  const excerpt = excerptVerifyOutput(
    result.output,
    result.log ?? 'the verify_ran event in .run/events/change.jsonl',
    config.limits,
  );
  return [
    '---',
    'reason: change_verify_red',
    ...(result.timedOut ? ['timed_out: true'] : []),
    `command: ${JSON.stringify(command)}`,
    `exit_code: ${result.exitCode}`,
    '---',
    `Change-level verification ${result.timedOut ? 'timed out' : 'failed'} after task verification passed.`,
    excerpt,
    '',
  ].join('\n');
}

/** Marker used when an approved proposal exposes no change-level verify command. */
export function formatMissingChangeVerifyMarker(): string {
  return [
    '---',
    'reason: change_verify_red',
    '---',
    'Proposal change-level verify is missing or unreadable; cannot gate task completion.',
    '',
  ].join('\n');
}

/**
 * Run the proposal's change-level verify after a passing task verify. Returns a
 * passing outcome when the gate is disabled or green, otherwise failure
 * evidence for the runner's single `fail` path. The shared gate entrypoint owns
 * the single `verify_ran` event, attributed to the established `change` target.
 *
 * When `rerun` is given, an unrelated failure is rerun up to
 * `gates.changeVerifyReruns` times; each repeat appends one
 * `change_verify_rerun` event to the task's own stream. A red end still builds
 * its marker from the last run.
 */
export async function runChangeVerifyGate(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
  rerun?: ChangeVerifyRerunContext,
): Promise<ChangeVerifyOutcome> {
  if (config.gates?.changeVerifyAfterTask === false) return { ok: true };

  const specData = await parseSpecMdFromFolder(specFolderPath);
  const command = specData?.verify ?? '';
  if (!command) {
    return {
      ok: false,
      marker: formatMissingChangeVerifyMarker(),
      error: 'Change-level verify command is missing',
    };
  }

  const timeoutSeconds = config.timeouts.verifyTimeoutSeconds ?? 600;
  const runOnce = (): Promise<VerificationGateResult> =>
    runVerificationGateResult(
      projectRoot,
      command,
      timeoutSeconds,
      { specFolderPath, taskNumber: 'change' },
      config,
    );

  let result = await runOnce();
  const context = rerun;
  const maxReruns = config.gates?.changeVerifyReruns ?? 1;
  let rerunNumber = 0;
  while (context !== undefined && !result.passed && rerunNumber < maxReruns) {
    const tests = await findUnrelatedFailingTests(result, projectRoot, context, config);
    if (tests === null) break;
    rerunNumber += 1;
    const rerunResult = await runOnce();
    await appendHarnessEvent(specFolderPath, context.taskNumber, {
      type: 'change_verify_rerun',
      timestamp: new Date().toISOString(),
      data: { rerun: rerunNumber, tests, passed: rerunResult.passed },
    });
    result = rerunResult;
  }
  if (result.passed) return { ok: true };

  const output = result.output.trim() || '(no output)';
  return {
    ok: false,
    marker: formatChangeVerifyMarker(command, config, result),
    error: result.error ?? `Change verify failed: ${output}`,
    ...(result.timedOut ? { extra: 'timed_out: true' } : {}),
  };
}
