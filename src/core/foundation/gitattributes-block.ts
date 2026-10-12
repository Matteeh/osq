import fs from 'node:fs/promises';
import path from 'node:path';

export const GITATTRIBUTES_START_MARKER = '# OSQ:GITATTRIBUTES:START';
export const GITATTRIBUTES_END_MARKER = '# OSQ:GITATTRIBUTES:END';

/** The managed block's three lines, joined with `\n` and no trailing newline. */
export const GITATTRIBUTES_BLOCK = `${GITATTRIBUTES_START_MARKER}\n* text=auto\n${GITATTRIBUTES_END_MARKER}`;

interface BlockRange {
  start: number;
  end: number;
}

/** The first ordered managed marker pair in `content`, or null. */
function findBlockRange(content: string): BlockRange | null {
  const start = content.indexOf(GITATTRIBUTES_START_MARKER);
  const end = content.indexOf(GITATTRIBUTES_END_MARKER);
  if (start === -1 || end < start) return null;
  return { start, end: end + GITATTRIBUTES_END_MARKER.length };
}

/** The block, a blank line, then the previous content, so later git rules win. */
function prependBlock(content: string): string {
  return `${GITATTRIBUTES_BLOCK}\n\n${content}`;
}

/** The next file contents, or null when the current block already matches. */
function applyBlock(content: string): string | null {
  if (content === '') return `${GITATTRIBUTES_BLOCK}\n`;
  const range = findBlockRange(content);
  if (range === null) return prependBlock(content);
  if (content.slice(range.start, range.end) === GITATTRIBUTES_BLOCK) return null;
  return `${content.slice(0, range.start)}${GITATTRIBUTES_BLOCK}${content.slice(range.end)}`;
}

/**
 * Keep one managed line-endings block in `projectRoot`'s `.gitattributes`.
 * Missing or empty files get the block and a trailing newline; a file without
 * a block gets it prepended; a stale block is replaced in place; a current
 * block is left untouched. Returns true only when the file was written.
 *
 * @scenario cli-foundation: Gitattributes block written by init
 * @scenario cli-foundation: Gitattributes block on a second init
 * @adr 003
 */
export async function writeGitattributesBlock(projectRoot: string): Promise<boolean> {
  const filePath = path.join(projectRoot, '.gitattributes');
  const existing = await fs.readFile(filePath, 'utf8').catch(() => null);
  const next = applyBlock(existing ?? '');
  if (next === null) return false;
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(filePath, next, 'utf8');
  return true;
}
