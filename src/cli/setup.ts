import { DEFAULT_CONFIG } from '../core/config.js';
import { getHarnessAdapter } from '../harness/index.js';

export async function setupCommand(options: { cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = DEFAULT_CONFIG;
  const adapter = getHarnessAdapter(config.harness);

  try {
    await adapter.setup(cwd, config);
    console.log(`Harness setup completed for "${adapter.name}".`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Setup failed: ${message}`);
    process.exit(1);
  }
}
