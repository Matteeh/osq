import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import type { ChangeTree } from '../core/status/change-locations.js';
import {
  type EveryFn,
  type FollowDispatchOptions,
  followDispatch,
} from '../core/status/dispatch-follow.js';
import { formatDispatchText } from '../core/status/dispatch-text.js';
import { readDispatch, readDispatchQueue } from '../core/status/dispatch.js';
import { type InboxSound, createInboxSound } from '../core/status/inbox-sound.js';
import type { ScheduleFn, WatcherFactory } from '../core/web/web-events.js';

export interface InboxDispatchOptions {
  cwd?: string;
  config?: OsqConfig;
  stdout?: (msg: string) => void;
  stderr?: (msg: string) => void;
  json?: boolean;
  follow?: boolean;
  signal?: AbortSignal;
  sound?: InboxSound;
  watch?: WatcherFactory;
  schedule?: ScheduleFn;
  every?: EveryFn;
  now?: () => Date;
  trees?: (projectRoot: string, config: OsqConfig) => Promise<readonly ChangeTree[]>;
}

/** The seams the follow loop consumes, forwarding only the ones provided. */
function followOptions(
  options: InboxDispatchOptions,
  cwd: string,
  config: OsqConfig,
): FollowDispatchOptions {
  const sound = options.sound ?? createInboxSound(cwd, config);
  return {
    sound,
    ...(options.stdout ? { stdout: options.stdout } : {}),
    ...(options.stderr ? { stderr: options.stderr } : {}),
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
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));
  if (options.follow && options.json) {
    const stderr = options.stderr ?? ((msg: string) => console.error(msg));
    stderr('osq inbox: --follow prints text; drop --json');
    process.exitCode = 1;
    return;
  }
  if (options.follow) {
    await followDispatch(cwd, config, followOptions(options, cwd, config));
    return;
  }
  const output = options.json
    ? JSON.stringify(await readDispatchQueue(cwd, config), null, 2)
    : formatDispatchText(await readDispatch(cwd, config));
  if (options.stdout) {
    options.stdout(output);
  } else {
    console.log(output);
  }
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
