import { loadConfig } from '../core/config.js';
import { updateAgentsMd } from '../core/init.js';
import { getHarnessAdapter } from '../harness/index.js';

export async function setupCommand(): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  await updateAgentsMd(cwd);
  const adapter = getHarnessAdapter(config.harness);
  await adapter.setup(cwd, config);
  if (config.planner?.harness && config.planner.harness !== config.harness) {
    const plannerAdapter = getHarnessAdapter(config.planner.harness);
    await plannerAdapter.setup(cwd, config);
  }
  console.log(`Harness '${config.harness}' setup completed successfully.`);
}
