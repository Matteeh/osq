import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { landChange } from '../core/vcs/land.js';

export interface LandCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  /** Injectable process exit; defaults to setting `process.exitCode`. */
  exit?: (code: number) => void;
}

/**
 * Land an archived change onto the default branch. Prints each line `landChange`
 * returns to stdout and exits with its code. A refusal or a stop prints only
 * its message to stderr and exits one.
 */
export async function landCommand(id: string, options: LandCommandOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg));
  const exit =
    options.exit ??
    ((code: number) => {
      process.exitCode = code;
    });

  try {
    const config = options.config || (await loadConfig(cwd));
    const { lines, code } = await landChange(cwd, config, id, (line) => stderr(`${line}\n`));
    for (const line of lines) stdout(`${line}\n`);
    exit(code);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`${message}\n`);
    exit(1);
  }
}

/** Register `osq land <id>` on the root program. */
export function registerLandCommand(program: Command): void {
  program
    .command('land <id>')
    .description('land an archived change onto the default branch')
    .action(async (id: string) => {
      await landCommand(id);
    });
}
