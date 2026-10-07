import type { WatchCommandOptions } from '../watcher/dev.js';
import { resolveInputs } from './command-inputs.js';
import { type WatchServiceOptions, resolveLogLevel, runWatchService } from './watch-service.js';

export type { WatchCommandOptions };
export type { WatchServiceOptions };
export { resolveLogLevel };

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

/**
 * Run `osq watch`: dev mode keeps its `tsx` supervisor, and every other form
 * dispatches through the watch service for its role and its `--background`,
 * `--stop` or terminal behaviour.
 */
export async function watchCommand(options: WatchServiceOptions): Promise<void> {
  if (shouldRunDevSupervisor(options) && !options.background) {
    const { runDevSupervisor } = await import('../watcher/dev.js');
    await runDevSupervisor(options);
    return;
  }

  const inputs = resolveInputs(options);
  const config = await inputs.config();
  await runWatchService(options, inputs, config);
}
