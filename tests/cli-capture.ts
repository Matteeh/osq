import { runCli } from '../src/cli/run.js';

/** One line a command wrote, tagged with the stream that received it. */
export interface CliLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** The lines `runCli` wrote and the exit code it left on `process.exitCode`. */
export interface CliCapture {
  readonly exitCode: number | undefined;
  readonly lines: readonly CliLine[];
}

/**
 * Run `runCli` in `cwd`, capturing every line each console method writes and
 * the exit code it leaves on `process.exitCode`. The working directory, the
 * previous `process.exitCode`, the console methods, and `process.exit` are
 * restored even when `runCli` rejects; `process.exit` itself throws so a
 * command that ends the process fails the test.
 */
export async function runCliCaptured(cwd: string, argv: readonly string[]): Promise<CliCapture> {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalExit = process.exit;
  const lines: CliLine[] = [];
  let exitCode: number | undefined;

  const push = (stream: 'stdout' | 'stderr') => {
    return (...args: unknown[]): void => {
      lines.push({ stream, text: args.map(String).join(' ') });
    };
  };
  console.log = push('stdout');
  console.error = push('stderr');
  console.warn = push('stderr');
  process.exit = ((_code?: number) => {
    throw new Error('process.exit called');
  }) as unknown as typeof process.exit;

  try {
    process.chdir(cwd);
    process.exitCode = undefined;
    await runCli(['node', 'osq', ...argv]);
    exitCode = process.exitCode;
  } finally {
    process.chdir(originalCwd);
    process.exitCode = originalExitCode;
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exit = originalExit;
  }

  return { exitCode, lines };
}
