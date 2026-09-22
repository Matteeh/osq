import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type OsqConfig, loadConfig } from '../core/config.js';
import { readLastLook, resolveLastLookPath } from '../core/inbox-cursor.js';
import { readInbox } from '../core/inbox-projection.js';
import { type Inbox, formatInboxText } from '../core/inbox.js';

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

export interface InboxCommandOptions {
  cwd?: string;
  stdout?: (msg: string) => void;
  config?: OsqConfig;
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
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));
  const now = options.now ?? new Date();

  try {
    const inbox = await readInbox(cwd, { config, now, home: options.home });
    await writeLastLook(cwd, now.toISOString(), options.home);

    const output = options.json ? JSON.stringify(inbox, null, 2) : formatInboxText(inbox);
    if (options.stdout) {
      options.stdout(output);
    } else {
      console.log(output);
    }
    return inbox;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Inbox error: ${message}`);
    process.exit(1);
  }
}
