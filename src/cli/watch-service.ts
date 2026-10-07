import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_WATCH_CONFIG } from '../core/foundation/config-watch.js';
import type { OsqConfig } from '../core/foundation/config.js';
import type { LogLevel } from '../core/foundation/logger.js';
import {
  type ServiceRecord,
  isProcessAlive,
  readWatchState,
  removeWatchRecordSync,
  watchStateDir,
  writeServiceRecord,
  writeWatcherRecord,
} from '../core/run/watch-state.js';
import { recreateWorktrees } from '../core/vcs/worktree-recreate.js';
import { getHarnessAdapter } from '../harness/index.js';
import { resolveBuildInfo } from '../watcher/build.js';
import type { WatchCommandOptions } from '../watcher/dev.js';
import { startWatcher } from '../watcher/loop.js';
import { createServiceBuildCheck } from '../watcher/service-build.js';
import { WATCH_ROLE_ENV, runServiceSupervisor } from '../watcher/service.js';
import type { StaleCheck } from '../watcher/stale-pass.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, commandLogger, type resolveInputs } from './command-inputs.js';

/** Options `osq watch` accepts, plus the service flags and the records' home. */
export interface WatchServiceOptions extends WatchCommandOptions, CommandInputs {
  /** Run the watcher as a background service. */
  background?: boolean;
  /** Stop the background service. */
  stop?: boolean;
  /** Home directory holding `~/.osq/watch`; defaults to `os.homedir()`. */
  home?: string;
}

/** The log level `--verbose` or `--quiet` selects. */
export function resolveLogLevel(options: WatchCommandOptions): LogLevel {
  if (options.quiet) return 'quiet';
  if (options.verbose) return 'verbose';
  return 'normal';
}

/** `--verbose` or `--quiet` when given; the flags a supervisor forwards. */
function forwardedFlags(options: WatchServiceOptions): string[] {
  const flags: string[] = [];
  if (options.verbose) flags.push('--verbose');
  if (options.quiet) flags.push('--quiet');
  return flags;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fails when a live record already holds the project and the process is no service. */
async function refuseLiveWatch(cwd: string, home: string | undefined): Promise<void> {
  const state = await readWatchState(cwd, home);
  if (state.service) {
    throw new CommandError(
      `osq watch is already running in the background (pid ${state.service.pid}). Log: ${state.service.log}. Stop it with osq watch --stop`,
    );
  }
  if (state.watcher) {
    throw new CommandError(`osq watch is already running in a terminal (pid ${state.watcher.pid})`);
  }
}

function validateBackground(options: WatchServiceOptions): void {
  if (options.once || options.dev || options.allowStale) {
    throw new CommandError('--background cannot be combined with --once, --dev or --allow-stale');
  }
}

function validateStop(options: WatchServiceOptions): void {
  const other =
    options.once ||
    options.verbose ||
    options.quiet ||
    options.allowStale ||
    options.dev ||
    options.background;
  if (other) throw new CommandError('--stop takes no other option');
}

/** Spawn the detached supervisor, append its output to `watch.log`, record its pid. */
async function startBackgroundWatch(
  options: WatchServiceOptions,
  cwd: string,
  stdout: (text: string) => void,
): Promise<void> {
  const log = path.join(await watchStateDir(cwd, options.home), 'watch.log');
  await fsp.mkdir(path.dirname(log), { recursive: true });
  const fd = fs.openSync(log, 'a');
  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(
      process.execPath,
      [...process.execArgv, process.argv[1] ?? '', 'watch', ...forwardedFlags(options)],
      {
        cwd,
        env: { ...process.env, [WATCH_ROLE_ENV]: 'supervisor' },
        detached: true,
        stdio: ['ignore', fd, fd],
      },
    );
  } finally {
    fs.closeSync(fd);
  }
  child.unref();
  const record: ServiceRecord = {
    pid: child.pid ?? 0,
    startedAt: new Date().toISOString(),
    log,
  };
  await writeServiceRecord(cwd, record, options.home);
  stdout(`osq watch is running in the background (pid ${record.pid}). Log: ${log}\n`);
}

/** SIGTERM the live supervisor and wait up to `watch.stopWaitSeconds` for it. */
async function stopBackgroundWatch(
  options: WatchServiceOptions,
  cwd: string,
  stdout: (text: string) => void,
  config: OsqConfig,
): Promise<void> {
  const state = await readWatchState(cwd, options.home);
  if (!state.service) {
    stdout('osq watch is not running in the background\n');
    return;
  }
  const pid = state.service.pid;
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // The process already exited; the poll below confirms it.
  }
  const waitMs = (config.watch ?? DEFAULT_WATCH_CONFIG).stopWaitSeconds * 1000;
  const deadline = Date.now() + waitMs;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await delay(50);
  }
  if (isProcessAlive(pid)) {
    stdout(`osq watch is stopping after its running task (pid ${pid})\n`);
  } else {
    stdout(`osq watch stopped (pid ${pid})\n`);
  }
}

/** Start the watcher loop for a continuous terminal process or a one-shot run. */
async function runWatcher(
  options: WatchServiceOptions,
  inputs: ReturnType<typeof resolveInputs>,
  config: OsqConfig,
): Promise<void> {
  const role = process.env[WATCH_ROLE_ENV];
  const adapter = getHarnessAdapter(config.harness);
  const logger = commandLogger(options, resolveLogLevel(options));
  for (const line of await recreateWorktrees(inputs.cwd, config)) {
    logger.info(line);
  }

  let buildCheck: StaleCheck | undefined;
  if (!options.once) {
    const stateDir = await watchStateDir(inputs.cwd, options.home);
    const info = await resolveBuildInfo();
    const base = {
      pid: process.pid,
      mode: role === 'worker' ? ('background' as const) : ('terminal' as const),
      version: info.version,
      commit: info.commit,
      startedAt: new Date().toISOString(),
      waiting: null as string | null,
    };
    await writeWatcherRecord(inputs.cwd, base, options.home);
    process.on('exit', () => removeWatchRecordSync(stateDir, 'watcher', process.pid));
    if (role === 'worker') {
      buildCheck = await createServiceBuildCheck({
        settleSeconds: (config.watch ?? DEFAULT_WATCH_CONFIG).buildSettleSeconds,
        logger,
        onWaiting: async (reason) => {
          await writeWatcherRecord(inputs.cwd, { ...base, waiting: reason }, options.home);
        },
      });
    }
  }

  await startWatcher(inputs.cwd, config, adapter, {
    once: options.once,
    allowStale: options.allowStale,
    dev: options.dev,
    logger,
    buildCheck,
  });
}

/**
 * Dispatch `osq watch` for its role and flags: stop the service, run the
 * supervisor, start a detached service, or run the terminal or worker watcher.
 */
export async function runWatchService(
  options: WatchServiceOptions,
  inputs: ReturnType<typeof resolveInputs>,
  config: OsqConfig,
): Promise<void> {
  if (options.stop) {
    validateStop(options);
    await stopBackgroundWatch(options, inputs.cwd, inputs.stdout, config);
    return;
  }

  if (process.env[WATCH_ROLE_ENV] === 'supervisor') {
    await runServiceSupervisor({
      projectRoot: inputs.cwd,
      config,
      entry: process.argv[1] ?? '',
      execArgv: [...process.execArgv],
      forwardArgs: forwardedFlags(options),
      home: options.home,
    });
    return;
  }

  // A service worker owns the project's record already, so it skips the check.
  if (process.env[WATCH_ROLE_ENV] !== 'worker') {
    await refuseLiveWatch(inputs.cwd, options.home);
  }

  if (options.background) {
    validateBackground(options);
    await startBackgroundWatch(options, inputs.cwd, inputs.stdout);
    return;
  }

  await runWatcher(options, inputs, config);
}
