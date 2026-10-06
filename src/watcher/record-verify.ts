import { DEFAULT_CONFIG, type OsqConfig } from '../core/foundation/config.js';
import type { VerificationResult } from '../core/run/verification.js';
import { tailVerifyOutput } from '../core/run/verify-excerpt.js';
import { writeVerifyLog } from '../core/run/verify-log.js';
import { appendHarnessEvent } from '../harness/types.js';

/** Extra `verify_ran` data derived from the completed result (e.g. pre-spawn fields). */
export type VerifyEventDataFn = (result: VerificationResult) => Record<string, unknown>;

/**
 * Write a run's whole output to its log and append one `verify_ran` event that
 * holds the log and the output's tail, present only when the tail is not blank.
 * Returns the change-folder-relative log path.
 */
export async function recordVerifyRan(
  specFolderPath: string,
  taskNumber: string,
  verifyCommand: string,
  result: VerificationResult,
  config: OsqConfig | undefined,
  extraData: VerifyEventDataFn | undefined,
): Promise<string> {
  const log = await writeVerifyLog(specFolderPath, taskNumber, result.output);
  const output = tailVerifyOutput(result.output, config?.limits ?? DEFAULT_CONFIG.limits);
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'verify_ran',
    timestamp: new Date().toISOString(),
    data: {
      command: verifyCommand,
      exitCode: result.exitCode,
      duration: result.duration,
      log,
      ...(output ? { output } : {}),
      ...(extraData ? extraData(result) : {}),
    },
  });
  return log;
}
