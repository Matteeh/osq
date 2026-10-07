import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readWatchState } from '../core/run/watch-state.js';
import { readLastLook, resolveLastLookPath } from '../core/status/inbox-cursor.js';
import { readInbox } from '../core/status/inbox-projection.js';
import { type Inbox, formatInboxText } from '../core/status/inbox.js';
import { formatWatcherLine } from '../core/status/watcher-line.js';
import { CommandError } from './command-error.js';
import { type CommandInputs, resolveInputs } from './command-inputs.js';

export { readLastLook, resolveLastLookPath };

/** Advance the cursor to `timestamp`; never writes inside a change folder. */
export async function writeLastLook(
  projectRoot: string,
  timestamp: string,
  home = os.homedir(),
): Promise<void> {
  const cursorPath = await resolveLastLookPath(projectRoot, home);
  await fs.mkdir(path.dirname(cursorPath), { recursive: true });
  await fs.writeFile(cursorPath, `${JSON.stringify({ lastLook: timestamp })}\n`, 'utf8');
}

export interface InboxCommandOptions extends CommandInputs {
  json?: boolean;
  /** Injectable invocation clock; also stamped into the advanced cursor. */
  now?: Date;
  /** Injectable home root so tests never touch the developer's real cursor. */
  home?: string;
}

/**
 * Read the read-only inbox projection, advance the cursor once, then print text
 * or the stable JSON object. Only this command advances last-look state.
 */
export async function inboxCommand(options: InboxCommandOptions = {}): Promise<Inbox> {
  const inputs = resolveInputs(options);
  const config = await inputs.config();
  const now = options.now ?? new Date();

  try {
    const inbox = await readInbox(inputs.cwd, { config, now, home: options.home });
    await writeLastLook(inputs.cwd, now.toISOString(), options.home);

    if (options.json) {
      inputs.stdout(`${JSON.stringify(inbox, null, 2)}\n`);
    } else {
      const watch = await readWatchState(inputs.cwd, options.home);
      inputs.stdout(`${formatInboxText(inbox)}\n${formatWatcherLine(watch)}\n`);
    }
    return inbox;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CommandError(`Inbox error: ${message}`);
  }
}
