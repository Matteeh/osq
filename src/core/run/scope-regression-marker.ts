import { DEFAULT_CONFIG } from '../foundation/config.js';
import { parseFrontmatter } from '../spec/parser.js';
import type { StaleTaskAudit } from './scope-hash.js';
import { type VerifyExcerptLimits, excerptVerifyOutput } from './verify-excerpt.js';

/** Render the structured regression marker body for humans and later retries. */
export function buildScopeRegressionMarker(
  input: Omit<StaleTaskAudit, 'alreadyActive'>,
  limits: VerifyExcerptLimits = DEFAULT_CONFIG.limits,
): string {
  return [
    '---',
    'reason: scope_regression',
    `task: ${JSON.stringify(input.taskNumber)}`,
    `recorded_hash: ${JSON.stringify(input.recordedHash)}`,
    `current_hash: ${JSON.stringify(input.currentHash)}`,
    `verify_command: ${JSON.stringify(input.verifyCommand)}`,
    `exit_code: ${input.exitCode}`,
    `duration: ${input.duration}`,
    `timed_out: ${input.timedOut}`,
    `verification_passed: ${input.verificationPassed}`,
    `attribution: ${JSON.stringify(input.attribution)}`,
    '---',
    `Task ${input.taskNumber} scope changed after completion:`,
    ...input.differingPaths.map((entry) => `- ${entry}`),
    '',
    excerptVerifyOutput(
      input.output,
      input.log ?? `the verify_ran event in .run/events/${input.taskNumber}.jsonl`,
      limits,
    ),
    '',
  ].join('\n');
}

/** Recover a stale task's record from an already-active regression marker. */
export function parseActiveStaleTask(
  taskNumber: string,
  content: string,
  base: Pick<StaleTaskAudit, 'differingPaths' | 'attribution' | 'recordedHash' | 'currentHash'>,
): StaleTaskAudit {
  const { data, body } = parseFrontmatter(content);
  return {
    taskNumber,
    ...base,
    verifyCommand: typeof data.verify_command === 'string' ? data.verify_command : '',
    exitCode: typeof data.exit_code === 'number' ? data.exit_code : 1,
    duration: typeof data.duration === 'number' ? data.duration : 0,
    output: body.trim(),
    timedOut: data.timed_out === true,
    verificationPassed: data.verification_passed === true,
    alreadyActive: true,
  };
}
