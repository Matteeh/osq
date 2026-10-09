import { ConfigLoadError } from '../core/foundation/config.js';
import { CommandError } from './command-error.js';
import { processStderr, processStdout } from './command-inputs.js';
import { createProgram, resolvePackageVersion } from './index.js';
import { forwardProgram } from './remote-client.js';
import { readServerSetting } from './remote-transport.js';

/**
 * Parse the command line and run the selected command. A `CommandError` is
 * reported as its non-empty message on stderr, then its `Next: <next>` line on
 * stdout when set, and sets `process.exitCode` to its exit code. A
 * `ConfigLoadError` is reported as `Error: <message>` on stderr and sets
 * `process.exitCode` to 1. Neither ends the process; every other error
 * propagates to the caller unchanged.
 * @scenario cli-foundation: Same command from a laptop
 * @scenario cli-foundation: Local-only commands name the alternative
 * @scenario cli-foundation: Server values
 * @adr 014
 */
export async function runCli(argv: readonly string[]): Promise<void> {
  const program = createProgram(resolvePackageVersion());
  try {
    const server = readServerSetting(process.env);
    if (server !== null) forwardProgram(program, server);
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof CommandError) {
      if (error.message) {
        processStderr(`${error.message}\n`);
      }
      if (error.next) {
        processStdout(`Next: ${error.next}\n`);
      }
      process.exitCode = error.exitCode;
      return;
    }
    if (error instanceof ConfigLoadError) {
      processStderr(`Error: ${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
