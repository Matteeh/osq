import { createNewSpec } from '../core/foundation/new.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export async function newCommand(name: string, options: CommandInputs = {}): Promise<void> {
  const inputs = resolveInputs(options);
  try {
    const config = await inputs.config();
    const result = await createNewSpec(inputs.cwd, name, { config });
    inputs.stdout(`Created spec ${result.specId}: ${result.folderName}\n`);
    inputs.stdout(`  Path: ${result.folderPath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(`Error: ${message}`);
  }
}
