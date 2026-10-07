import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_WATCH_CONFIG } from '../core/foundation/config-watch.js';
import type { OsqConfig } from '../core/foundation/config.js';
import { readWatchState, removeWatchRecord } from '../core/run/watch-state.js';
import { EXIT_NEW_BUILD } from './service-build.js';

/** Environment variable that tells a watcher process which role it runs. */
export const WATCH_ROLE_ENV = 'OSQ_WATCH_ROLE';

/** Everything the supervisor needs to spawn one watcher worker. */
export interface ServiceWorkerSpec {
  readonly command: string;
  readonly args: string[];
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  /** Absolute path of watch.log. */
  readonly logPath: string;
}

export interface ServiceSupervisorOptions {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  /** The `osq` entry path the supervisor was started with (`process.argv[1]`). */
  readonly entry: string;
  readonly execArgv: readonly string[];
  /** `--verbose` or `--quiet`, when given. */
  readonly forwardArgs: readonly string[];
  readonly home?: string;
}

export interface ServiceSupervisorOverrides {
  readonly spawnWorker?: (spec: ServiceWorkerSpec) => ChildProcess;
  readonly setTimer?: (callback: () => void, delayMs: number) => { cancel(): void };
  readonly now?: () => number;
  /** Subscribes to SIGTERM and SIGINT; returns the unsubscribe. */
  readonly onSignal?: (handler: () => void) => () => void;
  readonly exit?: (code: number) => void;
}

/** A cancellable timer handle, the shape `overrides.setTimer` returns. */
interface PendingTimer {
  cancel(): void;
}

/** The seams the supervisor runs with, each already defaulted. */
interface ResolvedDeps {
  readonly spawnWorker: (spec: ServiceWorkerSpec) => ChildProcess;
  readonly setTimer: (callback: () => void, delayMs: number) => PendingTimer;
  readonly now: () => number;
  readonly onSignal: (handler: () => void) => () => void;
  readonly exit: (code: number) => void;
}

function defaultSpawnWorker(spec: ServiceWorkerSpec): ChildProcess {
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

function defaultSetTimer(callback: () => void, delayMs: number): PendingTimer {
  const handle = setTimeout(callback, delayMs);
  return { cancel: () => clearTimeout(handle) };
}

function defaultOnSignal(handler: () => void): () => void {
  process.on('SIGTERM', handler);
  process.on('SIGINT', handler);
  return () => {
    process.removeListener('SIGTERM', handler);
    process.removeListener('SIGINT', handler);
  };
}

/**
 * Restart state machine for the background watcher service. It spawns a
 * worker, restarts it at once on a settled new osq build or after a doubling
 * backoff on a crash, and stops without a restart on a stop signal. Its own
 * lines go to `watch.log`, rotated before each spawn.
 */
class ServiceSupervisor {
  private readonly startDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly logMaxBytes: number;
  private readonly done: Promise<void>;
  private worker: ChildProcess | null = null;
  private workerStartedAt = 0;
  private timer: PendingTimer | null = null;
  private delayMs: number;
  private stopping = false;
  private finalized = false;
  private detachSignal: () => void = () => {};
  private resolveDone: () => void = () => {};

  constructor(
    private readonly options: ServiceSupervisorOptions,
    private readonly deps: ResolvedDeps,
    private readonly logPath: string,
  ) {
    const watch = options.config.watch ?? DEFAULT_WATCH_CONFIG;
    this.startDelayMs = watch.restartDelaySeconds * 1000;
    this.maxDelayMs = watch.restartMaxDelaySeconds * 1000;
    this.logMaxBytes = watch.logMaxBytes;
    this.delayMs = this.startDelayMs;
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  async run(): Promise<void> {
    this.detachSignal = this.deps.onSignal(() => this.handleSignal());
    await this.spawnWorkerNow();
    await this.done;
  }

  private async appendLog(message: string): Promise<void> {
    const line = `${new Date(this.deps.now()).toISOString()} ${message}\n`;
    await fsp.appendFile(this.logPath, line, 'utf8').catch(() => {});
  }

  private async rotateLog(): Promise<void> {
    const stat = await fsp.stat(this.logPath).catch(() => null);
    if (!stat || stat.size <= this.logMaxBytes) return;
    await fsp.rename(this.logPath, `${this.logPath}.1`).catch(() => {});
  }

  private cancelTimer(): void {
    if (!this.timer) return;
    this.timer.cancel();
    this.timer = null;
  }

  private async finish(code: number, removeService: boolean): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    this.detachSignal();
    this.cancelTimer();
    if (removeService) {
      await removeWatchRecord(
        this.options.projectRoot,
        'service',
        process.pid,
        this.options.home,
      ).catch(() => {});
    }
    this.resolveDone();
    this.deps.exit(code);
  }

  private async spawnWorkerNow(): Promise<void> {
    await this.rotateLog();
    const spec: ServiceWorkerSpec = {
      command: process.execPath,
      args: [...this.options.execArgv, this.options.entry, 'watch', ...this.options.forwardArgs],
      env: { ...process.env, [WATCH_ROLE_ENV]: 'worker' },
      cwd: this.options.projectRoot,
      logPath: this.logPath,
    };
    this.workerStartedAt = this.deps.now();
    const child = this.deps.spawnWorker(spec);
    this.worker = child;
    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      this.worker = null;
      void this.handleWorkerExit(code, signal);
    });
  }

  private scheduleRestart(delay: number): void {
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.spawnWorkerNow();
    }, delay);
  }

  private async handleWorkerExit(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): Promise<void> {
    if (this.stopping) {
      await this.finish(0, true);
      return;
    }
    if (code === EXIT_NEW_BUILD) {
      await this.appendLog('new osq build; restarting the watcher');
      this.delayMs = this.startDelayMs;
      await this.spawnWorkerNow();
      return;
    }
    if (this.deps.now() - this.workerStartedAt > this.maxDelayMs) {
      this.delayMs = this.startDelayMs;
    }
    const reason = code === null ? String(signal) : String(code);
    await this.appendLog(`watcher exited with ${reason}; restarting in ${this.delayMs / 1000}s`);
    const delay = this.delayMs;
    this.delayMs = Math.min(this.delayMs * 2, this.maxDelayMs);
    this.scheduleRestart(delay);
  }

  private handleSignal(): void {
    if (this.finalized) return;
    this.stopping = true;
    if (this.worker) {
      this.worker.kill('SIGINT');
      return;
    }
    void this.finish(0, true);
  }
}

/**
 * Run the watcher as a background service that outlives the terminal that
 * started it. The supervisor removes `service.json` when it stops, never
 * builds osq, and never runs git.
 * @scenario watcher-and-harness: Watch service supervisor
 */
export async function runServiceSupervisor(
  options: ServiceSupervisorOptions,
  overrides: ServiceSupervisorOverrides = {},
): Promise<void> {
  const { log: logPath } = await readWatchState(options.projectRoot, options.home);
  await fsp.mkdir(path.dirname(logPath), { recursive: true }).catch(() => {});
  const supervisor = new ServiceSupervisor(
    options,
    {
      spawnWorker: overrides.spawnWorker ?? defaultSpawnWorker,
      setTimer: overrides.setTimer ?? defaultSetTimer,
      now: overrides.now ?? Date.now,
      onSignal: overrides.onSignal ?? defaultOnSignal,
      exit: overrides.exit ?? ((code: number) => process.exit(code)),
    },
    logPath,
  );
  await supervisor.run();
}
