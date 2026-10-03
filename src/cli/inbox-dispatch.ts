import os from 'node:os';
import type { Command } from 'commander';
import type { OsqConfig } from '../core/foundation/config.js';
import type { ChangeTree } from '../core/status/change-locations.js';
import {
  type EveryFn,
  type FollowDispatchOptions,
  followDispatch,
} from '../core/status/dispatch-follow.js';
import {
  type CardInput,
  type CardSessionOptions,
  type Launcher,
  runCardSession,
} from '../core/status/dispatch-session.js';
import { formatDispatchText } from '../core/status/dispatch-text.js';
import { readDispatch, readDispatchQueue } from '../core/status/dispatch.js';
import { type InboxSound, createInboxSound } from '../core/status/inbox-sound.js';
import { createWaitRecorder } from '../core/status/wait-recorder.js';
import type { ScheduleFn, WatcherFactory } from '../core/web/web-events.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, type Writer, resolveInputs } from './command-inputs.js';
import { createChildLauncher, createTerminalInput } from './inbox-terminal.js';

export interface InboxDispatchOptions extends CommandInputs {
  json?: boolean;
  follow?: boolean;
  /** The home the wait log lives under; defaults to the user's home. */
  home?: string;
  /** Injectable terminal check; defaults to both stdio streams being TTYs. */
  isTerminal?: () => boolean;
  /** Injectable card input; defaults to the terminal input. */
  input?: CardInput;
  /** Injectable child launcher; defaults to the osq bin child launcher. */
  launch?: Launcher;
  signal?: AbortSignal;
  sound?: InboxSound;
  watch?: WatcherFactory;
  schedule?: ScheduleFn;
  every?: EveryFn;
  now?: () => Date;
  trees?: (projectRoot: string, config: OsqConfig) => Promise<readonly ChangeTree[]>;
}

function defaultIsTerminal(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

const BELL = '\u0007';

/** Append a newline to `writer`'s text, as an error line was printed before. */
function lineWriter(writer: Writer): Writer {
  return (message) => writer(`${message}\n`);
}

/** The default sound, ringing through `stdout` and warning through `stderr`. */
function defaultSound(cwd: string, config: OsqConfig, stdout: Writer, stderr: Writer): InboxSound {
  return createInboxSound(cwd, config, {
    bell: () => stdout(BELL),
    warn: (message) => stderr(`${message}\n`),
  });
}

/** The seams the card session consumes, filling the terminal defaults. */
function sessionOptions(
  options: InboxDispatchOptions,
  cwd: string,
  config: OsqConfig,
  home: string,
  stdout: Writer,
  stderr: Writer,
): CardSessionOptions {
  return {
    input: options.input ?? createTerminalInput(process.stdin, stdout),
    launch: options.launch ?? createChildLauncher(cwd),
    sound: options.sound ?? defaultSound(cwd, config, stdout, stderr),
    home,
    stdout,
    stderr,
    recorder: createWaitRecorder(cwd, 'cards', { home, stderr: lineWriter(stderr) }),
    ...(options.now ? { now: options.now } : {}),
    ...(options.watch ? { watch: options.watch } : {}),
    ...(options.schedule ? { schedule: options.schedule } : {}),
    ...(options.every ? { every: options.every } : {}),
    ...(options.trees ? { trees: options.trees } : {}),
  };
}

/** The seams the follow loop consumes, forwarding only the ones provided. */
function followOptions(
  options: InboxDispatchOptions,
  cwd: string,
  config: OsqConfig,
  home: string,
  stdout: Writer,
  stderr: Writer,
): FollowDispatchOptions {
  return {
    sound: options.sound ?? defaultSound(cwd, config, stdout, stderr),
    home,
    stdout,
    stderr,
    recorder: createWaitRecorder(cwd, 'follow', { home, stderr: lineWriter(stderr) }),
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.watch ? { watch: options.watch } : {}),
    ...(options.schedule ? { schedule: options.schedule } : {}),
    ...(options.every ? { every: options.every } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.trees ? { trees: options.trees } : {}),
  };
}

/**
 * Print the ordered dispatch queue, followed for text by the first item's card.
 * With `follow`, keep printing new and departed items until the signal aborts.
 * Read-only: it writes no marker and never advances the inbox cursor.
 */
export async function inboxDispatchCommand(options: InboxDispatchOptions = {}): Promise<void> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();
  const { cwd, stdout, stderr } = inputs;
  const home = options.home ?? os.homedir();
  if (options.follow && options.json) {
    throw new CommandError('osq inbox: --follow prints text; drop --json');
  }
  if (options.follow) {
    await followDispatch(cwd, config, followOptions(options, cwd, config, home, stdout, stderr));
    return;
  }
  if (options.json) {
    stdout(`${JSON.stringify(await readDispatchQueue(cwd, config, home), null, 2)}\n`);
    return;
  }
  const isTerminal = options.isTerminal ?? defaultIsTerminal;
  if (isTerminal()) {
    await runCardSession(cwd, config, sessionOptions(options, cwd, config, home, stdout, stderr));
    return;
  }
  stdout(`${formatDispatchText(await readDispatch(cwd, config, home))}\n`);
}

/** Register `osq inbox [--json] [--follow]` on the root program. */
export function registerInboxDispatchCommand(program: Command): void {
  program
    .command('inbox')
    .description('list what needs a human, in dispatch order, with the first card')
    .option('--json', 'print the dispatch queue and every card as JSON')
    .option('--follow', 'print new and departed items as they change, and sound on new work')
    .action(async (options: { json?: boolean; follow?: boolean }) => {
      const controller = new AbortController();
      const onSigint = (): void => controller.abort();
      process.once('SIGINT', onSigint);
      try {
        await inboxDispatchCommand({
          json: options.json,
          follow: options.follow,
          signal: controller.signal,
        });
      } finally {
        process.off('SIGINT', onSigint);
      }
    });
}
