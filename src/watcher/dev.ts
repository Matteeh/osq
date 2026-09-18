import { type ChildProcess, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch } from 'chokidar';

export const DEV_WORKER_ENV = 'OSQ_DEV_WORKER';
export const EXIT_SIGINT = 130;

/**
 * Options accepted by `osq watch`. Declared here, in the watcher tier, so the
 * CLI can consume them without the watcher importing from `src/cli`.
 */
export interface WatchCommandOptions {
  once?: boolean;
  dir?: string;
  harness?: string;
  verbose?: boolean;
  quiet?: boolean;
  symbols?: boolean;
  allowStale?: boolean;
  dev?: boolean;
}

/** Package root of the running osq build: `src/watcher/` or `dist/watcher/`. */
const PACKAGE_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

/** Command used to (re)spawn the watcher worker through `tsx`. */
export interface DevWorkerSpec {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

/**
 * Build the worker invocation for dev mode: execute the CLI's TypeScript entry
 * through `tsx` so editing `src/` is picked up on restart. `--dev` itself is not
 * forwarded, and `OSQ_DEV_WORKER` tells `watchCommand` it is already inside a
 * supervised worker so it starts the loop instead of the supervisor again.
 */
export function buildWorkerInvocation(
  options: WatchCommandOptions,
  packageRoot: string = PACKAGE_ROOT,
): DevWorkerSpec {
  const args = ['--import', 'tsx', path.join(packageRoot, 'src', 'cli', 'bin.ts'), 'watch'];
  if (options.once) args.push('--once');
  if (options.verbose) args.push('--verbose');
  if (options.quiet) args.push('--quiet');
  if (options.allowStale) args.push('--allow-stale');
  return {
    command: process.execPath,
    args,
    env: { ...process.env, [DEV_WORKER_ENV]: '1' },
  };
}

export interface DevWatchHandle {
  close: () => unknown;
}

/** Injection seams so the supervisor's restart state machine is testable. */
export interface DevSupervisorOverrides {
  packageRoot?: string;
  spawnWorker?: (spec: DevWorkerSpec) => ChildProcess;
  watchSource?: (sourceDir: string, onChange: () => void) => DevWatchHandle;
  onSignal?: (handler: () => void) => () => void;
  exit?: (code: number) => void;
  logError?: (message: string) => void;
}

function defaultSpawnWorker(spec: DevWorkerSpec): ChildProcess {
  return spawn(spec.command, spec.args, { env: spec.env, stdio: 'inherit' });
}

function defaultWatchSource(sourceDir: string, onChange: () => void): DevWatchHandle {
  const handle = watch(sourceDir, { ignoreInitial: true });
  handle.on('all', onChange);
  return { close: () => handle.close() };
}

function defaultOnSignal(handler: () => void): () => void {
  process.on('SIGINT', handler);
  return () => process.removeListener('SIGINT', handler);
}

/**
 * Dev-mode supervisor: runs the watcher as a child process through `tsx` from
 * `src/` and watches `src/` with chokidar. A source change only signals the
 * worker (SIGINT); the worker's own SIGINT handler finishes the running task
 * before exiting, after which the supervisor spawns a fresh worker that loads
 * the updated code. A user SIGINT shuts both down without restarting.
 */
export async function runDevSupervisor(
  options: WatchCommandOptions,
  overrides: DevSupervisorOverrides = {},
): Promise<void> {
  const packageRoot = overrides.packageRoot ?? PACKAGE_ROOT;
  const sourceDir = path.join(packageRoot, 'src');
  const exit = overrides.exit ?? ((code: number) => process.exit(code));
  const logError = overrides.logError ?? ((message: string) => console.error(message));

  const sourceStat = await fs.stat(sourceDir).catch(() => null);
  if (!sourceStat?.isDirectory()) {
    logError(`osq --dev requires a source checkout with src/ (looked in ${sourceDir}).`);
    exit(1);
    return;
  }

  const spawnWorker = overrides.spawnWorker ?? defaultSpawnWorker;
  const watchSource = overrides.watchSource ?? defaultWatchSource;
  const onSignal = overrides.onSignal ?? defaultOnSignal;

  let currentWorker: ChildProcess | null = null;
  let restartPending = false;
  let shuttingDown = false;
  let finalized = false;
  let watcherHandle: DevWatchHandle | null = null;
  let detachSignal: () => void = () => {};
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const finalize = (code: number): void => {
    if (finalized) return;
    finalized = true;
    detachSignal();
    watcherHandle?.close();
    resolveDone();
    exit(code);
  };

  const startWorker = (): void => {
    const spec = buildWorkerInvocation(options, packageRoot);
    const worker = spawnWorker(spec);
    currentWorker = worker;
    worker.on('exit', (code) => {
      currentWorker = null;
      if (shuttingDown) {
        finalize(EXIT_SIGINT);
        return;
      }
      if (restartPending) {
        restartPending = false;
        startWorker();
        return;
      }
      finalize(typeof code === 'number' ? code : 0);
    });
  };

  const requestRestart = (): void => {
    if (shuttingDown || restartPending) return;
    restartPending = true;
    currentWorker?.kill('SIGINT');
  };

  const handleSigint = (): void => {
    if (shuttingDown || finalized) return;
    shuttingDown = true;
    restartPending = false;
    if (!currentWorker) {
      finalize(EXIT_SIGINT);
      return;
    }
    currentWorker.kill('SIGINT');
  };

  detachSignal = onSignal(handleSigint);

  startWorker();
  watcherHandle = watchSource(sourceDir, requestRestart);

  await done;
}
