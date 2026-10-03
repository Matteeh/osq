import type { Command } from 'commander';
import { syncChange } from '../core/vcs/sync-change.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export type SyncCommandOptions = CommandInputs;

/**
 * Take the default branch into a change's branch. Prints the result line to
 * stdout and the sync's progress to stderr. A refusal or a stop throws a
 * `CommandError` whose message is the line it would have printed to stderr.
 */
export async function syncCommand(id: string, options: SyncCommandOptions = {}): Promise<void> {
  const inputs = resolveInputs(options);

  try {
    const config = await inputs.config();
    const line = await syncChange(inputs.cwd, config, id, (progress) =>
      inputs.stderr(`${progress}\n`),
    );
    inputs.stdout(`${line}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message);
  }
}

/** Register `osq sync <id>` on the root program. */
export function registerSyncCommand(program: Command): void {
  program
    .command('sync <id>')
    .description("merge the default branch into a change's branch")
    .action(async (id: string) => {
      await syncCommand(id);
    });
}
