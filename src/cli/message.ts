import type { Command } from 'commander';
import { buildSquashMessage } from '../core/run/squash-message.js';
import { worktreeBranch } from '../core/vcs/worktree.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export type MessageCommandOptions = CommandInputs;

/**
 * Print the land commit message for an archived change on stdout, then the
 * branch on stderr. A refusal throws a `CommandError` carrying its message and
 * exits one; the command prints no error line of its own. Writes no file and
 * runs no git write.
 */
export async function messageCommand(
  id: string,
  options: MessageCommandOptions = {},
): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();

  try {
    const { message, folder } = await buildSquashMessage(inputs.cwd, config, id);
    inputs.stdout(message);
    const branch = worktreeBranch(folder);
    inputs.stderr(`Branch: ${branch}\n`);
  } catch (error) {
    if (error instanceof CommandError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CommandError(message);
  }
}

/** Register `osq message <id>` on the root program. */
export function registerMessageCommand(program: Command): void {
  program
    .command('message <id>')
    .description("print an archived change's land commit message")
    .action(async (id: string) => {
      await messageCommand(id);
    });
}
