import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import {
  type VerificationTarget,
  recordVerification,
} from '../core/lifecycle/verification-record.js';
import { formatNextStep, readNextStep } from '../core/status/next-step.js';

export interface VerifiedCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  passed?: boolean;
  failed?: boolean;
  note?: string;
}

/** Print the error and exit non-zero; typed `never` so callers can return. */
function exitOne(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Append one human `verification_recorded` event to an archived change that
 * requires verification and print its next step. Exactly one of `--passed` and
 * `--failed` is required; every refusal writes nothing.
 */
export async function verifiedCommand(
  specId: string,
  options: VerifiedCommandOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  const passed = options.passed === true;
  const failed = options.failed === true;
  if (passed === failed) {
    return exitOne('Error: specify exactly one of --passed or --failed.');
  }

  let target: VerificationTarget;
  try {
    target = await recordVerification(
      cwd,
      specId,
      passed ? 'passed' : 'failed',
      options.note ?? null,
      config,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return exitOne(`Error recording verification for ${specId}:\n  ${message}`);
  }

  console.log(`Verified ${target.id} (${target.folderName})`);
  const step = await readNextStep(cwd, target.folderPath, config);
  console.log(`Next: ${formatNextStep(step)}`);
}
