import { type DoctorReport, runDoctorChecks } from '../core/foundation/doctor.js';

export interface DoctorCommandOptions {
  readonly cwd?: string;
  readonly stdout?: (line: string) => void;
  readonly report?: DoctorReport;
  readonly exit?: (code: number) => void;
}

/**
 * Runs repository diagnostics and prints one line per check. Sets a non-zero
 * exit code when any check fails. Sinks are injectable for testing.
 */
export async function doctorCommand(options: DoctorCommandOptions = {}): Promise<DoctorReport> {
  const cwd = options.cwd ?? process.cwd();
  const report = options.report ?? (await runDoctorChecks(cwd));
  const write = options.stdout ?? ((line: string) => console.log(line));
  const exit =
    options.exit ??
    ((code: number) => {
      process.exitCode = code;
    });

  for (const check of report.checks) {
    write(`${check.ok ? '[ok]' : '[fail]'} ${check.name}: ${check.message}`);
  }

  if (!report.ok) {
    exit(1);
  }

  return report;
}
