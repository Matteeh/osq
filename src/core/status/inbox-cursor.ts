import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/**
 * Per-project last-look cursor location and reading. Both the CLI and the
 * read-only web transport consume these helpers; only the CLI advances the
 * cursor.
 */

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
