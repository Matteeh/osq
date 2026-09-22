import type { OsqConfig } from '../core/foundation/config.js';
import { parseSpecMdFromFolder } from '../core/spec/parser.js';
import { type VerificationGateResult, runVerificationGateResult } from './verify.js';

/** Failure evidence for a red change gate; the runner writes it through `fail`. */
export interface ChangeVerifyFailure {
  marker: string;
  error: string;
  extra?: string;
}

export type ChangeVerifyOutcome = { ok: true } | ({ ok: false } & ChangeVerifyFailure);

/** Deterministic marker with reason, command, numeric exit code, timeout, output. */
export function formatChangeVerifyMarker(command: string, result: VerificationGateResult): string {
  const output = result.output.trim() || '(no output)';
  return [
    '---',
    'reason: change_verify_red',
    ...(result.timedOut ? ['timed_out: true'] : []),
    `command: ${JSON.stringify(command)}`,
    `exit_code: ${result.exitCode}`,
    '---',
    `Change-level verification ${result.timedOut ? 'timed out' : 'failed'} after task verification passed.`,
    output,
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
 */
export async function runChangeVerifyGate(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
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

  const result = await runVerificationGateResult(
    projectRoot,
    command,
    config.timeouts.verifyTimeoutSeconds ?? 600,
    { specFolderPath, taskNumber: 'change' },
  );
  if (result.passed) return { ok: true };

  const output = result.output.trim() || '(no output)';
  return {
    ok: false,
    marker: formatChangeVerifyMarker(command, result),
    error: result.error ?? `Change verify failed: ${output}`,
    ...(result.timedOut ? { extra: 'timed_out: true' } : {}),
  };
}
