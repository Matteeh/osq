import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { type OsqConfig, loadConfig } from '../core/config.js';
import { type Inbox, collectLandedItems, formatInboxText, projectInbox } from '../core/inbox.js';
import { getArchiveDir } from '../core/layout.js';
import { getStatusOverview } from '../core/status.js';

/** Per-project cursor path: `~/.osq/last-look/<sha256(realpath(root))>.json`. */
export async function resolveLastLookPath(
  projectRoot: string,
  home = os.homedir(),
): Promise<string> {
  const real = await fs.realpath(projectRoot).catch(() => path.resolve(projectRoot));
  const hash = createHash('sha256').update(real, 'utf8').digest('hex');
  return path.join(home, '.osq', 'last-look', `${hash}.json`);
}

/** Read the cursor as epoch milliseconds; missing, malformed, or invalid => null. */
export async function readLastLook(
  projectRoot: string,
  home = os.homedir(),
): Promise<number | null> {
  const cursorPath = await resolveLastLookPath(projectRoot, home);
  const content = await fs.readFile(cursorPath, 'utf8').catch(() => null);
  if (content === null) return null;
  try {
    const parsed = JSON.parse(content) as { lastLook?: unknown };
    if (typeof parsed.lastLook !== 'string') return null;
    const ms = Date.parse(parsed.lastLook);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

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
 * Read the per-project cursor, project the status snapshot into the inbox,
 * advance the cursor once, then print text or the stable JSON object.
 */
export async function inboxCommand(options: InboxCommandOptions = {}): Promise<Inbox> {
  const cwd = options.cwd || process.cwd();
  const config = options.config || (await loadConfig(cwd));
  const now = options.now ?? new Date();

  try {
    const overview = await getStatusOverview(cwd, config);
    const lastLookMs = await readLastLook(cwd, options.home);
    const archiveDir = getArchiveDir(config.paths.openspecRoot, cwd);
    const landed = await collectLandedItems(archiveDir, lastLookMs);
    const inbox = projectInbox(overview, landed, now.getTime());

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
