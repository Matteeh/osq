import { formatQueue, projectQueue } from '../core/status/queue.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export interface QueueCommandOptions extends CommandInputs {}

/** Thin CLI wrapper: load config, project the read-only queue, and print it. */
export async function queueCommand(options: QueueCommandOptions = {}): Promise<string> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  try {
    const projection = await projectQueue(inputs.cwd, config);
    const formatted = formatQueue(projection);
    inputs.stdout(`${formatted}\n`);
    return formatted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Queue error: ${message}`);
  }
}
