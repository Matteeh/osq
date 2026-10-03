import type { OsqConfig } from '../core/foundation/config.js';
import type { Launcher } from '../core/status/dispatch-session.js';
import { approveCommand } from './approve.js';
import { CommandError } from './command-error.js';
import type { Writer } from './command-inputs.js';
import { planCommand } from './plan.js';
import { rejectCommand } from './reject.js';
import { retryCommand } from './retry.js';
import { showCommand } from './show.js';

/** What one in-process card action receives: the card session's loaded inputs. */
export interface ActionInputs {
  cwd: string;
  config: OsqConfig;
  stdout: Writer;
  stderr: Writer;
}

/** Runs one card verb with the arguments after it, or returns null when they do not fit. */
export type CardAction = (args: readonly string[], inputs: ActionInputs) => Promise<void> | null;

/** The default table: one card verb to one command function. */
const DEFAULT_ACTIONS: Readonly<Record<string, CardAction>> = {
  approve: (args, inputs) => (args.length === 1 ? approveCommand([args[0]], inputs) : null),
  plan: (args, inputs) => (args.length === 1 ? planCommand(args[0], inputs) : null),
  retry: (args, inputs) => (args.length === 2 ? retryCommand(args[0], args[1], inputs) : null),
  reject: (args, inputs) =>
    args.length === 3 && args[1] === '--reason'
      ? rejectCommand(args[0], { ...inputs, reason: args[2] })
      : null,
  show: (args, inputs) =>
    args.length === 1 ? showCommand(args[0], inputs).then(() => undefined) : null,
};

/**
 * Build the launcher a card session runs each key's command with. It calls the
 * command function in this process, never a child, prints a `CommandError` the
 * way `runCli` does, and resolves with the command's exit code.
 */
export function createActionLauncher(
  inputs: ActionInputs,
  actions: Readonly<Record<string, CardAction>> = DEFAULT_ACTIONS,
): Launcher {
  return async (args) => {
    const [verb, ...rest] = args;
    try {
      const action: CardAction | undefined = Object.hasOwn(actions, verb)
        ? actions[verb]
        : undefined;
      const result = action === undefined ? null : action(rest, inputs);
      if (result === null) {
        inputs.stderr(`osq inbox: no action for ${args.join(' ')}\n`);
        return 1;
      }
      await result;
      return 0;
    } catch (error) {
      if (error instanceof CommandError) {
        if (error.message) inputs.stderr(`${error.message}\n`);
        if (error.next) inputs.stdout(`Next: ${error.next}\n`);
        return error.exitCode;
      }
      const message = error instanceof Error ? error.message : String(error);
      inputs.stderr(`Error: ${message}\n`);
      return 1;
    }
  };
}
