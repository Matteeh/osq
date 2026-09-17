import { loadConfig } from '../core/config.js';
import { getHarnessAdapter } from '../harness/index.js';
import { startWatcher } from '../watcher/loop.js';

export async function watchCommand(options: { once?: boolean }): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const adapter = getHarnessAdapter(config.harness);
  await startWatcher(cwd, config, adapter, options);
}
