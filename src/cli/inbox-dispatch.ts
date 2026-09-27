import type { Command } from 'commander';
import { type OsqConfig, loadConfig } from '../core/foundation/config.js';
import { formatDispatchText } from '../core/status/dispatch-text.js';
import { readDispatch, readDispatchQueue } from '../core/status/dispatch.js';

export interface InboxDispatchOptions {
  cwd?: string;
  config?: OsqConfig;
  stdout?: (msg: string) => void;
  json?: boolean;
}

/**
 * Print the ordered dispatch queue, followed for text by the first item's card.
 * Read-only: it writes no marker and never advances the inbox cursor.
 */
export async function inboxDispatchCommand(options: InboxDispatchOptions = {}): Promise<void> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));
  const output = options.json
    ? JSON.stringify(await readDispatchQueue(cwd, config), null, 2)
    : formatDispatchText(await readDispatch(cwd, config));
  if (options.stdout) {
    options.stdout(output);
  } else {
    console.log(output);
  }
}

/** Register `osq inbox [--json]` on the root program. */
export function registerInboxDispatchCommand(program: Command): void {
  program
    .command('inbox')
    .description('list what needs a human, in dispatch order, with the first card')
    .option('--json', 'print the dispatch queue and every card as JSON')
    .action(async (options: { json?: boolean }) => {
      await inboxDispatchCommand({ json: options.json });
    });
}
