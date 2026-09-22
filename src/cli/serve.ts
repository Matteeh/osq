import { spawn } from 'node:child_process';
import { InvalidArgumentError } from 'commander';
import { DEFAULT_SERVE_CONFIG, isValidPort } from '../core/config-serve.js';
import { type OsqConfig, loadConfig } from '../core/config.js';
import { startWebServer } from '../core/web-server.js';

/** Injectable inputs so tests never bind a fixed port, open a browser, or wait on signals. */
export interface ServeCommandOptions {
  readonly cwd?: string;
  readonly port?: number;
  readonly open?: boolean;
  readonly config?: OsqConfig;
  readonly uiDir?: string;
  readonly home?: string;
  readonly stdout?: (line: string) => void;
  readonly signal?: AbortSignal;
  readonly launchBrowser?: (url: string) => Promise<void>;
  readonly now?: () => Date;
}

/** Parse a Commander `--port` value without coercing decimals, whitespace, or overflow. */
export function parsePortArgument(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new InvalidArgumentError('port must be an integer from 0 through 65535');
  }
  const port = Number(value);
  if (!isValidPort(port)) {
    throw new InvalidArgumentError('port must be an integer from 0 through 65535');
  }
  return port;
}

/** Literal platform browser launch arguments; no runtime dependency is added. */
export function browserCommand(
  platform: NodeJS.Platform,
  url: string,
): { command: string; args: string[] } {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  if (platform === 'win32') return { command: 'cmd', args: ['/c', 'start', '', url] };
  return { command: 'xdg-open', args: [url] };
}

/** Launch the platform default browser detached; success does not wait for the child. */
export function launchBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const { command, args } = browserCommand(platform, url);
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, { stdio: 'ignore', detached: true });
    } catch (error) {
      reject(error);
      return;
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function wireShutdown(signal?: AbortSignal): { done: Promise<void>; dispose: () => void } {
  if (signal) {
    let onAbort: (() => void) | undefined;
    const done = new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      onAbort = () => resolve();
      signal.addEventListener('abort', onAbort, { once: true });
    });
    return {
      done,
      dispose: () => {
        if (onAbort) signal.removeEventListener('abort', onAbort);
      },
    };
  }
  let onSignal: (() => void) | undefined;
  const done = new Promise<void>((resolve) => {
    onSignal = () => resolve();
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
  });
  return {
    done,
    dispose: () => {
      if (!onSignal) return;
      process.removeListener('SIGINT', onSignal);
      process.removeListener('SIGTERM', onSignal);
    },
  };
}

/**
 * Print the actual loopback URL, optionally open it, wait for a signal, then
 * close server resources. Every failure closes the listener before surfacing.
 */
export async function serveCommand(options: ServeCommandOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const config = options.config ?? (await loadConfig(cwd));
  const port = options.port ?? config.serve?.port ?? DEFAULT_SERVE_CONFIG.port;
  if (!isValidPort(port)) {
    throw new Error(`invalid serve port ${port}; expected an integer from 0 through 65535`);
  }
  const write = options.stdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const launch = options.launchBrowser ?? launchBrowser;

  const handle = await startWebServer({
    projectRoot: cwd,
    config,
    port,
    uiDir: options.uiDir,
    home: options.home,
    now: options.now,
  });
  write(handle.url);

  if (options.open) {
    try {
      await launch(handle.url);
    } catch (error) {
      await handle.close();
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`could not open ${handle.url}: ${reason}`);
    }
  }

  const shutdown = wireShutdown(options.signal);
  try {
    await shutdown.done;
  } finally {
    shutdown.dispose();
    await handle.close();
  }
}
