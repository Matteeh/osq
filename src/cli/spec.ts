import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { lookupRequirement } from '../core/spec/requirement-lookup.js';
import { CommandError } from './command-error.js';

export interface SpecCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  stdout?: (msg: string) => void;
}

/**
 * List living capabilities, list one capability's requirement names, or print
 * one requirement. A failed lookup throws a `CommandError` carrying the
 * lookup's message, so `runCli` prints it to stderr and exits one.
 */
export async function specCommand(
  capability?: string,
  requirement?: string,
  options: SpecCommandOptions = {},
): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg));

  try {
    const config = options.config || (await loadConfig(cwd));
    const result = await lookupRequirement(cwd, config.paths.openspecRoot, capability, requirement);
    const text = Array.isArray(result) ? result.map((line) => `${line}\n`).join('') : `${result}\n`;
    stdout(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message);
  }
}

/** Register `osq spec [capability] [requirement]` on the root program. */
export function registerSpecCommand(program: Command): void {
  program
    .command('spec [capability] [requirement]')
    .description('list living capabilities and their requirements, or print one requirement')
    .action(async (capability?: string, requirement?: string) => {
      await specCommand(capability, requirement);
    });
}
