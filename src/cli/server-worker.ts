import os from 'node:os';
import path from 'node:path';
import { DEFAULT_SERVE_CONFIG } from '../core/foundation/config-serve.js';
import { DEFAULT_WATCH_CONFIG } from '../core/foundation/config-watch.js';
import type { OsqConfig } from '../core/foundation/config.js';
import type { WebActionVerb } from '../core/web/web-actions.js';
import { type WebServerHandle, startWebServer } from '../core/web/web-server.js';
import type { WebServerSite } from '../core/web/web-site.js';
import {
  BuildChangedError,
  EXIT_NEW_BUILD,
  createServiceBuildCheck,
} from '../watcher/service-build.js';
import { approveCommand } from './approve.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';
import { landCommand } from './land.js';
import { rejectCommand } from './reject.js';
import { createForwardedRunner } from './remote-commands.js';
import { retryCommand } from './retry.js';
import { type WebCommand, createWebActionRunner } from './serve-actions.js';

/** Options the server worker takes; `osq server start` calls it in the worker role. */
export interface ServerWorkerOptions extends CommandInputs {
  /** Home directory holding `~/.osq/watch`; defaults to `os.homedir()`. */
  home?: string;
  /** Injectable clock; defaults to the real one. */
  now?: () => Date;
}

/**
 * The project's path segment: the project root's folder name with every
 * character other than a letter, digit, `.`, `_` or `-` replaced by `-`.
 * @scenario cli-foundation: Server defaults
 */
export function defaultProjectSegment(projectRoot: string): string {
  return path.basename(path.resolve(projectRoot)).replace(/[^A-Za-z0-9._-]/g, '-');
}

/**
 * The site `osq server` serves: `serve.server.name` or `os.hostname()`, and
 * `serve.server.project` or the project folder's sanitized name.
 * @scenario cli-foundation: Server defaults
 */
export function resolveServerSite(
  projectRoot: string,
  config: OsqConfig,
  hostname: () => string = os.hostname,
): WebServerSite {
  const server = config.serve?.server ?? DEFAULT_SERVE_CONFIG.server;
  return {
    name: server.name ?? hostname(),
    project: server.project ?? defaultProjectSegment(projectRoot),
  };
}

/**
 * The server worker's action table: `land` publishes to `origin`; every other
 * verb runs the same command function `osq serve`'s default table calls.
 * @scenario cli-foundation: Server land publishes
 * @adr 014
 */
export function createServerCommands(
  land: typeof landCommand = landCommand,
): Readonly<Record<WebActionVerb, WebCommand>> {
  return {
    approve: (request, inputs) => {
      const opened = request.verb === 'approve' ? request.opened : undefined;
      return approveCommand(
        [request.change],
        opened === undefined ? inputs : { ...inputs, openedNotices: opened },
      );
    },
    land: (request, inputs) => land(request.change, { ...inputs, publish: true }),
    reject: (request, inputs) => {
      if (request.verb !== 'reject') {
        throw new Error(`expected a reject request, got ${request.verb}`);
      }
      return rejectCommand(request.change, { ...inputs, reason: request.reason });
    },
    retry: (request, inputs) => {
      if (request.verb !== 'retry') {
        throw new Error(`expected a retry request, got ${request.verb}`);
      }
      return retryCommand(request.change, request.target, inputs);
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run the server worker: the dashboard over `/p/<project>/` with the action
 * table that publishes land, a build check every `serve.server.buildCheckSeconds`
 * that closes the server and exits with `EXIT_NEW_BUILD` on a settled new build
 * once no action runs, and a SIGINT or SIGTERM handler that closes the server
 * after any running action and exits 0.
 * @scenario cli-foundation: Start and stop
 * @adr 012
 */
export async function runServerWorker(options: ServerWorkerOptions = {}): Promise<void> {
  const { cwd, config: readConfig } = resolveInputs(options);
  const config = await readConfig();
  const serverConfig = config.serve?.server ?? DEFAULT_SERVE_CONFIG.server;
  const runner = createWebActionRunner({ cwd, config }, createServerCommands());

  let handle: WebServerHandle | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = 0;
  let pendingNewBuild = false;
  let closing = false;
  let settle: (error?: unknown) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    settle = (error) => (error === undefined ? resolve() : reject(error));
  });

  const shutdown = async (): Promise<void> => {
    if (closing) return;
    closing = true;
    if (timer) clearInterval(timer);
    await handle?.close();
  };

  const finishBuild = async (): Promise<void> => {
    if (closing) return;
    await shutdown();
    settle(new CommandError('', { exitCode: EXIT_NEW_BUILD }));
  };

  handle = await startWebServer({
    projectRoot: cwd,
    config,
    port: serverConfig.port,
    site: resolveServerSite(cwd, config),
    home: options.home,
    now: options.now,
    runCommand: createForwardedRunner(cwd, { home: options.home }),
    runAction: async (request) => {
      running += 1;
      try {
        return await runner(request);
      } finally {
        running -= 1;
        if (pendingNewBuild && running === 0) setImmediate(() => void finishBuild());
      }
    },
  });

  const check = await createServiceBuildCheck({
    settleSeconds: config.watch?.buildSettleSeconds ?? DEFAULT_WATCH_CONFIG.buildSettleSeconds,
  });
  timer = setInterval(() => {
    void (async () => {
      try {
        await check();
      } catch (error) {
        if (!(error instanceof BuildChangedError)) return;
        if (running > 0) {
          pendingNewBuild = true;
          return;
        }
        await finishBuild();
      }
    })();
  }, serverConfig.buildCheckSeconds * 1000);

  const stop = (): void => {
    void (async () => {
      if (closing) return;
      closing = true;
      if (timer) clearInterval(timer);
      while (running > 0) await delay(50);
      await handle?.close();
      settle();
    })();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await done;
}
