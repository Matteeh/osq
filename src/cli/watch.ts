import { loadConfig } from '../core/config.js';
import { type LogLevel, createLogger } from '../core/logger.js';
import { getHarnessAdapter } from '../harness/index.js';
import { startWatcher } from '../watcher/loop.js';

export interface WatchCommandOptions {
  once?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

export function resolveLogLevel(options: WatchCommandOptions): LogLevel {
  if (options.quiet) return 'quiet';
  if (options.verbose) return 'verbose';
  return 'normal';
}

export async function watchCommand(options: WatchCommandOptions): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const adapter = getHarnessAdapter(config.harness);
  const logger = createLogger(resolveLogLevel(options), 'osq');
  const watcherOptions = { ...options, logger };
  await startWatcher(cwd, config, adapter, watcherOptions);
}
