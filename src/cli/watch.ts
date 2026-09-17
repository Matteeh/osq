import { DEFAULT_CONFIG } from '../core/config.js';
import { getHarnessAdapter } from '../harness/index.js';
import { startWatcher } from '../watcher/loop.js';

export async function watchCommand(options: { once?: boolean; cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = DEFAULT_CONFIG;
  const adapter = getHarnessAdapter(config.harness);

  console.log(`Starting osq watcher (harness: ${adapter.name}, once: ${Boolean(options.once)})...`);

  const abortController = new AbortController();
  const onSigint = () => {
    console.log('\nStopping watcher...');
    abortController.abort();
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigint);
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigint);

  try {
    await startWatcher(cwd, config, adapter, {
      once: options.once,
      signal: abortController.signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Watcher error: ${message}`);
    process.exit(1);
  }
}
