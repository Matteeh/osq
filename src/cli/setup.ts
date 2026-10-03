import { updateAgentsMd } from '../core/foundation/init.js';
import { getHarnessAdapter } from '../harness/index.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export async function setupCommand(options: CommandInputs = {}): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();
  await updateAgentsMd(inputs.cwd);
  const adapter = getHarnessAdapter(config.harness);
  await adapter.setup(inputs.cwd, config);
  if (config.planner?.harness && config.planner.harness !== config.harness) {
    const plannerAdapter = getHarnessAdapter(config.planner.harness);
    await plannerAdapter.setup(inputs.cwd, config);
  }
  inputs.stdout(`Harness '${config.harness}' setup completed successfully.\n`);
}
