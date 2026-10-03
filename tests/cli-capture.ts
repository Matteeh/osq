import { runCli } from '../src/cli/run.js';

/** One write a command made, tagged with the stream that received it. */
export interface CliLine {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** The writes `runCli` made and the exit code it left on `process.exitCode`. */
export interface CliCapture {
  readonly exitCode: number | undefined;
  readonly lines: readonly CliLine[];
  /** The exact text written to `process.stdout`. */
  readonly stdout: string;
  /** The exact text written to `process.stderr`. */
  readonly stderr: string;
}

/**
 * Run `runCli` in `cwd`, capturing every write to `process.stdout` and
 * `process.stderr` (console calls included) and the exit code it leaves on
 * `process.exitCode`. Each write becomes one `CliLine` with one trailing
 * newline removed. The working directory, the previous `process.exitCode`, the
 * stream writes, and `process.exit` are restored even when `runCli` rejects;
 * `process.exit` itself throws so a command that ends the process fails the
 * test.
 */
export async function runCliCaptured(cwd: string, argv: readonly string[]): Promise<CliCapture> {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalExit = process.exit;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const lines: CliLine[] = [];
  let exitCode: number | undefined;

  const record = (stream: 'stdout' | 'stderr', chunk: string | Uint8Array): boolean => {
    const text = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    if (stream === 'stdout') stdoutChunks.push(text);
    else stderrChunks.push(text);
    lines.push({ stream, text: text.endsWith('\n') ? text.slice(0, -1) : text });
    return true;
  };

  process.stdout.write = ((chunk: string | Uint8Array) =>
    record('stdout', chunk)) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) =>
    record('stderr', chunk)) as typeof process.stderr.write;
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
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exit = originalExit;
  }

  return {
    exitCode,
    lines,
    stdout: stdoutChunks.join(''),
    stderr: stderrChunks.join(''),
  };
}
