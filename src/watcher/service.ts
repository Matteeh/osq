import type { ChildProcess } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_WATCH_CONFIG } from '../core/foundation/config-watch.js';
import type { OsqConfig } from '../core/foundation/config.js';
import { removeWatchRecord, watchStateDir } from '../core/run/watch-state.js';
import { EXIT_NEW_BUILD } from './service-build.js';
import {
  type PendingTimer,
  type ServiceWorkerSpec,
  defaultOnSignal,
  defaultSetTimer,
  defaultSpawnWorker,
} from './service-deps.js';

export type { ServiceWorkerSpec };

/** Environment variable that tells a watcher process which role it runs. */
export const WATCH_ROLE_ENV = 'OSQ_WATCH_ROLE';

/** Environment variable that tells a server process which role it runs. */
export const SERVER_ROLE_ENV = 'OSQ_SERVER_ROLE';

export interface ServiceSupervisorOptions {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  /** The `osq` entry path the supervisor was started with (`process.argv[1]`). */
  readonly entry: string;
  readonly execArgv: readonly string[];
  /** `--verbose` or `--quiet`, when given. */
  readonly forwardArgs: readonly string[];
  /** Which service the supervisor runs; `watch` when unset. */
  readonly service?: 'watch' | 'server';
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

/** The seams the supervisor runs with, each already defaulted. */
interface ResolvedDeps {
  readonly spawnWorker: (spec: ServiceWorkerSpec) => ChildProcess;
  readonly setTimer: (callback: () => void, delayMs: number) => PendingTimer;
  readonly now: () => number;
  readonly onSignal: (handler: () => void) => () => void;
  readonly exit: (code: number) => void;
}

/**
 * Restart state machine for a background service. It spawns a worker,
 * restarts it at once on a settled new osq build or after a doubling backoff
 * on a crash, and stops without a restart on a stop signal. Its own lines go
 * to the service's log, rotated before each spawn.
 */
class ServiceSupervisor {
  private readonly startDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly logMaxBytes: number;
  private readonly server: boolean;
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
    this.server = options.service === 'server';
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

  private async finish(code: number, removeRecord: boolean): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    this.detachSignal();
    this.cancelTimer();
    if (removeRecord) {
      await removeWatchRecord(
        this.options.projectRoot,
        this.server ? 'server' : 'service',
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
      args: this.server
        ? [...this.options.execArgv, this.options.entry, 'server', 'start']
        : [...this.options.execArgv, this.options.entry, 'watch', ...this.options.forwardArgs],
      env: {
        ...process.env,
        [this.server ? SERVER_ROLE_ENV : WATCH_ROLE_ENV]: 'worker',
      },
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
      await this.appendLog(
        this.server
          ? 'new osq build; restarting the server'
          : 'new osq build; restarting the watcher',
      );
      this.delayMs = this.startDelayMs;
      await this.spawnWorkerNow();
      return;
    }
    if (this.deps.now() - this.workerStartedAt > this.maxDelayMs) {
      this.delayMs = this.startDelayMs;
    }
    const reason = code === null ? String(signal) : String(code);
    const label = this.server ? 'server' : 'watcher';
    await this.appendLog(`${label} exited with ${reason}; restarting in ${this.delayMs / 1000}s`);
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
 * Run a service as a background supervisor that outlives the terminal that
 * started it. With `service: 'server'` it spawns the server worker, logs to
 * `server.log`, and removes `server.json` on stop; with no `service` it runs
 * the watch service exactly as before. The supervisor removes the service's
 * record when it stops, never builds osq, and never runs git.
 * @scenario watcher-and-harness: Watch service supervisor
 * @scenario watcher-and-harness: Server supervisor
 * @adr 012
 */
export async function runServiceSupervisor(
  options: ServiceSupervisorOptions,
  overrides: ServiceSupervisorOverrides = {},
): Promise<void> {
  const logFile = options.service === 'server' ? 'server.log' : 'watch.log';
  const logPath = path.join(await watchStateDir(options.projectRoot, options.home), logFile);
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
