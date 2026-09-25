import { spawn } from 'node:child_process';

/** Raw outcome of one timeout-bounded verification command. */
export interface VerificationResult {
  command: string;
  exitCode: number;
  /** Wall-clock duration in seconds, rounded to two decimals. */
  duration: number;
  /** Combined stdout and stderr captured while the command ran. */
  output: string;
  timedOut: boolean;
  /** Spawn-level failure message, when the process could not be started. */
  error?: string;
}

function killTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  const pid = child.pid ?? Number.NaN;
  try {
    process.kill(-pid, signal);
  } catch {
    child.kill(signal);
  }
}

/**
 * Execute a verification command under a configured timeout, capturing its
 * command, exit code, wall-clock duration, combined output, and timeout state.
 *
 * This is the single core process implementation shared by the task,
 * scope-audit, archive, and recertification gates. It never imports from the
 * watcher or harness layers, so core retains its import boundary; callers own
 * event emission.
 *
 * `changeFolder` is the absolute change folder the command runs for, or null
 * for a command whose deltas are already in the living spec. It becomes
 * `OSQ_CHANGE`, or is removed from the child environment when null.
 */
export async function runVerificationCommand(
  projectRoot: string,
  command: string,
  timeoutSeconds: number,
  changeFolder: string | null,
): Promise<VerificationResult> {
  const startMs = Date.now();
  const timeoutMs = timeoutSeconds * 1000;
  let timedOut = false;
  let exitCode = 1;
  let output = '';
  let spawnError: string | undefined;
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (changeFolder === null) {
    Reflect.deleteProperty(env, 'OSQ_CHANGE');
  } else {
    env.OSQ_CHANGE = changeFolder;
  }

  await new Promise<void>((resolve) => {
    const child = spawn(command, {
      cwd: projectRoot,
      shell: true,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let timer: NodeJS.Timeout | null = null;
    let killTimer: NodeJS.Timeout | null = null;
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve();
    };

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child, 'SIGTERM');
        killTimer = setTimeout(() => killTree(child, 'SIGKILL'), 5000);
      }, timeoutMs);
    }

    child.stderr?.on('data', (d) => {
      output += d.toString();
    });
    child.stdout?.on('data', (d) => {
      output += d.toString();
    });
    child.on('error', (err) => {
      spawnError = err.message;
      finish();
    });
    child.on('close', (code) => {
      exitCode = timedOut ? 1 : (code ?? 1);
      finish();
    });
  });

  return {
    command,
    exitCode,
    duration: Number(((Date.now() - startMs) / 1000).toFixed(2)),
    output,
    timedOut,
    ...(spawnError ? { error: spawnError } : {}),
  };
}
