import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { type CheckRunResult, runCheck } from '../core/lifecycle/verification-record.js';
import { formatNextStep, readNextStep } from '../core/status/next-step.js';
import { verifiedCommand } from './verified.js';

export interface CheckCommandOptions {
  cwd?: string;
  config?: OsqConfig;
}

/** Print the error and exit non-zero; typed `never` so callers can return. */
function exitOne(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Print one check run's command, exit code, output, and the change's next step. */
async function printCheckResult(
  cwd: string,
  config: OsqConfig,
  result: CheckRunResult,
): Promise<void> {
  console.log(`Checked ${result.id} (${result.folderName})`);
  console.log(`  Command: ${result.check.command}`);
  console.log(`  Exit code: ${result.check.exitCode}`);
  console.log(`  Duration: ${result.check.duration}s`);
  if (result.check.timedOut) console.log('  Timed out: yes');
  const output = result.check.output.trim();
  if (output) {
    console.log('  Output:');
    for (const line of output.split('\n')) console.log(`    ${line}`);
  }
  const step = await readNextStep(cwd, result.folderPath, config);
  console.log(`Next: ${formatNextStep(step)}`);
}

/**
 * Run an archived change's recorded `check` command once, append one
 * `check_ran` event, print the result and next step, and exit zero only when
 * the check passed. A refusal writes nothing.
 */
export async function checkCommand(
  specId: string,
  options: CheckCommandOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));

  let result: CheckRunResult;
  try {
    result = await runCheck(cwd, specId, config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return exitOne(`Error running check for ${specId}:\n  ${message}`);
  }

  await printCheckResult(cwd, config, result);
  if (result.check.exitCode !== 0 || result.check.timedOut) process.exit(1);
}

/** Register `osq check` and `osq verified` on the root program. */
export function registerVerificationCommands(program: Command): void {
  program
    .command('check <id>')
    .description("run an archived change's recorded check command")
    .action(async (id: string) => {
      await checkCommand(id);
    });

  program
    .command('verified <id>')
    .description('record a human after-landing verification outcome')
    .option('--passed', 'record a passed outcome')
    .option('--failed', 'record a failed outcome')
    .option('--note <text>', 'optional note recorded with the outcome')
    .action(async (id: string, options: { passed?: boolean; failed?: boolean; note?: string }) => {
      await verifiedCommand(id, options);
    });
}
