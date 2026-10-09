import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { DEFAULT_SERVE_CONFIG } from '../core/foundation/config-serve.js';
import { DEFAULT_WATCH_CONFIG } from '../core/foundation/config-watch.js';
import {
  type ServerRecord,
  isProcessAlive,
  readServerRecord,
  readWatchState,
  watchStateDir,
  writeServerRecord,
} from '../core/run/watch-state.js';
import { SERVER_ROLE_ENV, runServiceSupervisor } from '../watcher/service.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, type Writer, resolveInputs } from './command-inputs.js';
import { resolveServerSite, runServerWorker } from './server-worker.js';
import { startBackgroundWatch, stopBackgroundWatch } from './watch-service.js';

/** A detached supervisor spawn the server command asks for. */
export interface SupervisorSpawn {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly log: string;
}

export interface ServerCommandOptions extends CommandInputs {
  /** Home directory holding `~/.osq/watch`; defaults to `os.homedir()`. */
  home?: string;
  /** Test seam: spawn the detached supervisor and return its pid. */
  spawnSupervisor?: (spec: SupervisorSpawn) => number | undefined;
  /** Test seam: start the background watch service. */
  startWatchService?: (cwd: string, home: string | undefined, stdout: Writer) => Promise<void>;
  /** Injectable clock for `startedAt`; defaults to the real one. */
  now?: () => Date;
}

/** Spawn the detached server supervisor with its output appended to `server.log`. */
function defaultSpawnSupervisor(spec: SupervisorSpawn): number | undefined {
  const fd = fs.openSync(spec.log, 'a');
  try {
    const child = spawn(process.execPath, [...spec.args], {
      cwd: spec.cwd,
      env: spec.env,
      detached: true,
      stdio: ['ignore', fd, fd],
    });
    child.unref();
    return child.pid;
  } finally {
    fs.closeSync(fd);
  }
}

function defaultStartWatchService(
  cwd: string,
  home: string | undefined,
  stdout: Writer,
): Promise<void> {
  return startBackgroundWatch({ cwd, home }, cwd, stdout);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start the dashboard and the watch service in the background. A live
 * `server.json` refuses; a role-carrying process runs the supervisor or the
 * worker instead of spawning. Otherwise it starts the watch service only when
 * no live service or watcher record exists, then spawns the detached server
 * supervisor and records it.
 * @scenario cli-foundation: Start and stop
 * @scenario cli-foundation: Already running
 * @scenario cli-foundation: Watcher already running
 * @adr 012
 * @adr 014
 */
export async function startServer(options: ServerCommandOptions = {}): Promise<void> {
  const inputs = resolveInputs(options);
  const cwd = inputs.cwd;
  const config = await inputs.config();
  const role = process.env[SERVER_ROLE_ENV];

  if (role === 'supervisor') {
    await runServiceSupervisor({
      projectRoot: cwd,
      config,
      entry: process.argv[1] ?? '',
      execArgv: [...process.execArgv],
      forwardArgs: [],
      service: 'server',
      home: options.home,
    });
    return;
  }
  if (role === 'worker') {
    await runServerWorker({
      cwd,
      config,
      home: options.home,
      now: options.now,
      stdout: options.stdout,
      stderr: options.stderr,
    });
    return;
  }

  const live = await readServerRecord(cwd, options.home);
  if (live !== null) {
    throw new CommandError(
      `osq server is already running (pid ${live.pid}). Log: ${live.log}. Stop it with osq server stop`,
    );
  }

  const state = await readWatchState(cwd, options.home);
  if (state.service === null && state.watcher === null) {
    const start = options.startWatchService ?? defaultStartWatchService;
    await start(cwd, options.home, inputs.stdout);
  }

  const log = path.join(await watchStateDir(cwd, options.home), 'server.log');
  await fsp.mkdir(path.dirname(log), { recursive: true });
  const port = (config.serve?.server ?? DEFAULT_SERVE_CONFIG.server).port;
  const url = `http://127.0.0.1:${port}/p/${resolveServerSite(cwd, config).project}/`;
  const spawnSupervisor = options.spawnSupervisor ?? defaultSpawnSupervisor;
  const pid =
    spawnSupervisor({
      args: [...process.execArgv, process.argv[1] ?? '', 'server', 'start'],
      cwd,
      env: { ...process.env, [SERVER_ROLE_ENV]: 'supervisor' },
      log,
    }) ?? 0;
  const record: ServerRecord = {
    pid,
    startedAt: (options.now ?? (() => new Date()))().toISOString(),
    log,
    url,
  };
  await writeServerRecord(cwd, record, options.home);
  inputs.stdout(
    `osq server is running in the background (pid ${record.pid}) at ${record.url}. Log: ${record.log}\n`,
  );
}

/**
 * Stop the server supervisor and then the watch service. A live record gets
 * SIGTERM and up to `watch.stopWaitSeconds`; the printed line says whether it
 * exited or is stopping after its running action. Without a live record it
 * says the server is not running. The watch service stop prints its own line.
 * @scenario cli-foundation: Start and stop
 * @scenario cli-foundation: Stop with nothing running
 */
export async function stopServer(options: ServerCommandOptions = {}): Promise<void> {
  const inputs = resolveInputs(options);
  const cwd = inputs.cwd;
  const config = await inputs.config();
  const live = await readServerRecord(cwd, options.home);

  if (live === null) {
    inputs.stdout('osq server is not running\n');
  } else {
    const pid = live.pid;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process already exited; the poll below confirms it.
    }
    const waitMs = (config.watch ?? DEFAULT_WATCH_CONFIG).stopWaitSeconds * 1000;
    const deadline = Date.now() + waitMs;
    while (isProcessAlive(pid) && Date.now() < deadline) {
      await wait(50);
    }
    inputs.stdout(
      isProcessAlive(pid)
        ? `osq server is stopping after its running action (pid ${pid})\n`
        : `osq server stopped (pid ${pid})\n`,
    );
  }

  await stopBackgroundWatch({ cwd, home: options.home }, cwd, inputs.stdout, config);
}

/** Register `osq server start` and `osq server stop` on the root program. */
export function registerServerCommand(program: Command): void {
  const server = program
    .command('server')
    .description('run the dashboard and the watcher service for this project');
  server
    .command('start')
    .description('run the dashboard and the watcher service in the background')
    .action(async () => {
      await startServer();
    });
  server
    .command('stop')
    .description('stop the server and the watcher service')
    .action(async () => {
      await stopServer();
    });
}
