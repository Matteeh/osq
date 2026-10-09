import type { Command } from 'commander';
import type { ForwardedCommand } from '../core/web/web-remote.js';
import { CommandError } from './command-error.js';
import { processStderr, processStdout } from './command-inputs.js';
import { lintOnServer, planOnServer } from './remote-plan.js';
import { type RemoteServer, runOnServer } from './remote-transport.js';

/** The commands forwarded to the server; the root command is `osq`. */
const FORWARDED = new Set([
  'status',
  'show',
  'report',
  'query',
  'spec',
  'digest',
  'graph',
  'queue',
  'message',
  'approve',
  'land',
  'reject',
  'retry',
  'sync',
  'new',
  'lint',
  'plan',
]);

/** The commands that only run on the machine the CLI starts on. */
const LOCAL_ONLY = new Set([
  'init',
  'setup',
  'migrate',
  'watch',
  'serve',
  'doctor',
  'inbox',
  'server',
]);

/** The one line a local-only command refuses with. */
function localOnly(name: string): CommandError {
  return new CommandError(
    `osq ${name} runs only locally; unset OSQ_SERVER to run it here, or run it on the server`,
  );
}

/** The forwarded request built from a Commander action's values. */
function requestFrom(name: string, values: readonly unknown[]): ForwardedCommand {
  const rest = [...values];
  rest.pop();
  const options = (rest.pop() ?? {}) as Readonly<Record<string, unknown>>;
  const args: unknown[] = [];
  for (const value of rest) {
    if (Array.isArray(value)) {
      for (const item of value) args.push(item ?? null);
    } else {
      args.push(value ?? null);
    }
  }
  return { command: name, args, options };
}

/**
 * Replace every action on `program` so each command reaches `server` instead of
 * running locally: forwarded commands send their parsed request and print the
 * streamed output, while local-only commands refuse before any request.
 * `plan` and `lint` download and upload a working copy first.
 * @scenario cli-foundation: Same command from a laptop
 * @scenario cli-foundation: Local-only commands name the alternative
 * @adr 014
 */
export function forwardProgram(program: Command, server: RemoteServer): void {
  const forwarded = (name: string) => {
    return async (...values: unknown[]): Promise<void> => {
      const request = requestFrom(name, values);
      if (name === 'digest' && request.options.out !== undefined) {
        throw localOnly('digest --out');
      }
      if (name === 'plan') {
        if (request.options.session === true) throw localOnly('plan --session');
        if (request.options.brief !== undefined) throw localOnly('plan --brief');
        await planOnServer(server, request, { stdout: processStdout, stderr: processStderr });
        return;
      }
      if (name === 'lint') {
        await lintOnServer(server, request, { stdout: processStdout, stderr: processStderr });
        return;
      }
      const end = await runOnServer(server, request, processStdout, processStderr);
      if (end.exitCode !== 0) {
        throw new CommandError(end.error ?? '', {
          exitCode: end.exitCode,
          ...(end.next === null ? {} : { next: end.next }),
        });
      }
    };
  };
  const refused = (name: string) => {
    return async (): Promise<void> => {
      throw localOnly(name);
    };
  };
  const apply = (command: Command): void => {
    const name = command.name();
    if (LOCAL_ONLY.has(name)) {
      if (command.commands.length === 0) command.action(refused(name));
      else for (const child of command.commands) child.action(refused(name));
      return;
    }
    if (FORWARDED.has(name)) command.action(forwarded(name));
  };

  program.action(forwarded('osq'));
  for (const command of program.commands) apply(command);
}
