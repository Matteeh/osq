import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { buildSquashMessage } from '../core/run/squash-message.js';
import { worktreeBranch } from '../core/vcs/worktree.js';
import { CommandError } from './command-error.js';

export interface MessageCommandOptions {
  cwd?: string;
  config?: OsqConfig;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
}

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
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));
  const stdout = options.stdout ?? ((msg: string) => process.stdout.write(msg));
  const stderr = options.stderr ?? ((msg: string) => process.stderr.write(msg));

  try {
    const { message, folder } = await buildSquashMessage(cwd, config, id);
    stdout(message);
    const branch = worktreeBranch(folder);
    stderr(`Branch: ${branch}\n`);
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
