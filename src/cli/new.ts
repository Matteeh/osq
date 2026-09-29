import { createNewSpec } from '../core/foundation/new.js';
import { CommandError } from './command-error.js';

export async function newCommand(name: string, options: { cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  try {
    const result = await createNewSpec(cwd, name);
    console.log(`Created spec ${result.specId}: ${result.folderName}`);
    console.log(`  Path: ${result.folderPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(`Error: ${message}`);
  }
}
