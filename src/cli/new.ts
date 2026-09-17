import { createNewSpec } from '../core/new.js';

export async function newCommand(name: string, options: { cwd?: string } = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  try {
    const result = await createNewSpec(cwd, name);
    console.log(`Created spec ${result.specId}: ${result.folderName}`);
    console.log(`  Path: ${result.folderPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
