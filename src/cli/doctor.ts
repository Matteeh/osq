import type { Command } from 'commander';
import { type DoctorReport, runDoctorChecks } from '../core/foundation/doctor.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface DoctorCommandOptions extends CommandInputs {
  readonly report?: DoctorReport;
}

/**
 * Runs repository diagnostics and prints one line per check. Throws a
 * `CommandError` with exit code 1 when any check fails. Sinks are injectable
 * for testing.
 */
export async function doctorCommand(options: DoctorCommandOptions = {}): Promise<DoctorReport> {
  const inputs = resolveInputs(options);
  const report =
    options.report ??
    (await runDoctorChecks(inputs.cwd, { loadConfig: async () => inputs.config() }));

  for (const check of report.checks) {
    const prefix = check.ok ? (check.warning === true ? '[warn]' : '[ok]') : '[fail]';
    inputs.stdout(`${prefix} ${check.name}: ${check.message}\n`);
  }

  if (!report.ok) {
    throw new CommandError('', { exitCode: 1 });
  }

  return report;
}

/** Register `osq doctor` on the root program. */
export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('validate repository health, configuration, and archives')
    .action(async () => {
      await doctorCommand();
    });
}
