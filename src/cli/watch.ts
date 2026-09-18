import { loadConfig } from '../core/config.js';
import { type LogLevel, createLogger } from '../core/logger.js';
import { getHarnessAdapter } from '../harness/index.js';
import type { WatchCommandOptions } from '../watcher/dev.js';
import { startWatcher } from '../watcher/loop.js';

export type { WatchCommandOptions };

export function resolveLogLevel(options: WatchCommandOptions): LogLevel {
  if (options.quiet) return 'quiet';
  if (options.verbose) return 'verbose';
  return 'normal';
}

/**
 * Dev mode hands control to the supervisor, which runs the watcher as a `tsx`
 * child and restarts it on source changes. The supervised worker carries
 * `OSQ_DEV_WORKER=1` and must start the loop rather than recurse.
 */
export function shouldRunDevSupervisor(
  options: WatchCommandOptions,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return options.dev === true && env.OSQ_DEV_WORKER !== '1';
}

export async function watchCommand(options: WatchCommandOptions): Promise<void> {
  if (shouldRunDevSupervisor(options)) {
    const { runDevSupervisor } = await import('../watcher/dev.js');
    await runDevSupervisor(options);
    return;
  }

  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const adapter = getHarnessAdapter(config.harness);
  const logger = createLogger(resolveLogLevel(options), 'osq');
  const watcherOptions = { ...options, logger };
  await startWatcher(cwd, config, adapter, watcherOptions);
}
