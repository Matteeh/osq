import { ConfigLoadError } from '../core/foundation/config.js';
import { createProgram, resolvePackageVersion } from './index.js';

/**
 * Parse the command line and run the selected command. A `ConfigLoadError`
 * from any command is reported as `Error: <message>` on stderr and exits 1;
 * every other error propagates to the caller unchanged.
 */
export async function runCli(argv: readonly string[]): Promise<void> {
  const program = createProgram(resolvePackageVersion());
  try {
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof ConfigLoadError) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
      return;
    }
    throw error;
  }
}
