import { formatStatusOverview, getStatusOverview } from '../core/status/status.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export async function statusCommand(options: CommandInputs = {}): Promise<string> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  try {
    const overview = await getStatusOverview(inputs.cwd, config);
    const formatted = formatStatusOverview(overview);
    inputs.stdout(`${formatted}\n`);
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Status error: ${message}`);
  }
}
