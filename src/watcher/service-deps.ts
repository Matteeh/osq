import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';

/** Everything the supervisor needs to spawn one service worker. */
export interface ServiceWorkerSpec {
  readonly command: string;
  readonly args: string[];
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  /** Absolute path of the service log. */
  readonly logPath: string;
}

/** A cancellable timer handle, the shape `setTimer` returns. */
export interface PendingTimer {
  cancel(): void;
}

/** Default worker spawn: append stdout and stderr to the service log. */
export function defaultSpawnWorker(spec: ServiceWorkerSpec): ChildProcess {
  const fd = fs.openSync(spec.logPath, 'a');
  try {
    return spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ['ignore', fd, fd],
    });
  } finally {
    fs.closeSync(fd);
  }
}

/** Default restart timer. */
export function defaultSetTimer(callback: () => void, delayMs: number): PendingTimer {
  const handle = setTimeout(callback, delayMs);
  return { cancel: () => clearTimeout(handle) };
}

/** Default stop-signal subscription, for SIGTERM and SIGINT. */
export function defaultOnSignal(handler: () => void): () => void {
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
  return () => {
    process.removeListener('SIGTERM', handler);
    process.removeListener('SIGINT', handler);
  };
}
