import type { Command } from 'commander';
import { type DoctorReport, runDoctorChecks } from '../core/foundation/doctor.js';
import { CommandError } from './command-error.js';

export interface DoctorCommandOptions {
  readonly cwd?: string;
  readonly stdout?: (line: string) => void;
  readonly report?: DoctorReport;
}

/**
 * Runs repository diagnostics and prints one line per check. Throws a
 * `CommandError` with exit code 1 when any check fails. Sinks are injectable
 * for testing.
 */
export async function doctorCommand(options: DoctorCommandOptions = {}): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();
  const report = options.report ?? (await runDoctorChecks(cwd));
  const write = options.stdout ?? ((line: string) => console.log(line));

  for (const check of report.checks) {
    const prefix = check.ok ? (check.warning === true ? '[warn]' : '[ok]') : '[fail]';
    write(`${prefix} ${check.name}: ${check.message}`);
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
