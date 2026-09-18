import { type StdioOptions, spawn } from 'node:child_process';

export const DEFAULT_KILL_GRACE_PERIOD_MS = 5000;

export interface SpawnWithTimeoutOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutSeconds?: number;
  killGracePeriodMs?: number;
  stdio?: StdioOptions;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onSpawn?: (pid: number) => void;
}

export interface SpawnProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  signal?: NodeJS.Signals | string | null;
  error?: string;
  pid?: number;
  elapsedMs?: number;
}

export function spawnWithTimeout(options: SpawnWithTimeoutOptions): Promise<SpawnProcessResult> {
  const {
    command,
    args = [],
    cwd,
    env = process.env,
    timeoutSeconds = 0,
    killGracePeriodMs = DEFAULT_KILL_GRACE_PERIOD_MS,
    stdio = ['ignore', 'pipe', 'pipe'],
    onStdout,
    onStderr,
    onSpawn,
  } = options;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let timedOut = false;
    let settled = false;
    let timeoutTimer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;
    let stdoutOutput = '';
    let stderrOutput = '';

    const child = spawn(command, args, {
      cwd,
      env,
      stdio,
    });
    const childPid = child.pid;

    if (childPid !== undefined) {
      onSpawn?.(childPid);
    }

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (killTimer) {
        clearTimeout(killTimer);
        killTimer = null;
      }
    };

    const finish = (result: SpawnProcessResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        ...result,
        pid: childPid,
        elapsedMs: Date.now() - startTime,
      });
    };

    if (timeoutSeconds > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');

        killTimer = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {}
        }, killGracePeriodMs);
      }, timeoutSeconds * 1000);
    }

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stdoutOutput += text;
      onStdout?.(text);
    });

    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      stderrOutput += text;
      onStderr?.(text);
    });

    child.on('error', (err) => {
      finish({
        exitCode: 1,
        stdout: stdoutOutput,
        stderr: stderrOutput,
        timedOut: false,
        signal: null,
        error: err.message,
      });
    });

    child.on('close', (code, signal) => {
      const exitCode = timedOut
        ? code !== null && code !== 0
          ? code
          : 124
        : code !== null
          ? code
          : 1;

      const error =
        exitCode !== 0
          ? timedOut
            ? 'Task execution timed out'
            : stderrOutput || stdoutOutput || undefined
          : undefined;

      finish({
        exitCode,
        stdout: stdoutOutput,
        stderr: stderrOutput,
        timedOut,
        signal: signal ?? null,
        error,
      });
    });
  });
}
