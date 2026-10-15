import type { Command } from 'commander';
import { keepManualEdits } from '../core/vcs/manual-edits.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export type ManualCommandOptions = CommandInputs;

/**
 * Keep the checkout's uncommitted edits as one manual change with a comment.
 * Prints each result line to stdout and exits zero; a refusal throws a
 * `CommandError` whose message is the refusal.
 *
 * @scenario cli-foundation: Manual command keeps edits
 * @scenario cli-foundation: Manual command refusal
 * @adr 003
 */
export async function manualCommand(
  comment: string,
  paths: string[] = [],
  options: ManualCommandOptions = {},
): Promise<void> {
  const inputs = resolveInputs(options);

  try {
    const config = await inputs.config();
    const lines = await keepManualEdits(inputs.cwd, config, { comment, paths });
    for (const line of lines) inputs.stdout(`${line}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message);
  }
}

/** Register `osq manual <comment> [paths...]` on the root program. */
export function registerManualCommand(program: Command): void {
  program
    .command('manual <comment> [paths...]')
    .description('keep uncommitted edits as a manual change with a comment')
    .action(async (comment: string, paths: string[]) => {
      await manualCommand(comment, paths);
    });
}
