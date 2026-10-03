import type { Command } from 'commander';
import { lookupRequirement } from '../core/spec/requirement-lookup.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export type SpecCommandOptions = CommandInputs;

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
  const inputs = resolveInputs(options);

  try {
    const config = await inputs.config();
    const result = await lookupRequirement(
      inputs.cwd,
      config.paths.openspecRoot,
      capability,
      requirement,
    );
    const text = Array.isArray(result) ? result.map((line) => `${line}\n`).join('') : `${result}\n`;
    inputs.stdout(text);
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
