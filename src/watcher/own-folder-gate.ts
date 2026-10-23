import fs from 'node:fs/promises';
import path from 'node:path';

/** A task's changed files that name its own change folder outside a comment. */
export interface OwnFolderViolation {
  readonly reason: 'own_folder_path';
  readonly marker: string;
  readonly error: string;
}

const NAME_EDGE = '[\\p{L}\\p{N}_-]';

/** Escape a literal string for use inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Blank every comment, keeping newlines so line numbers stay unchanged. */
function blankComments(text: string): string {
  const blanked = text.split('');
  let index = 0;
  while (index < text.length) {
    if (text.startsWith('/*', index)) {
      const close = text.indexOf('*/', index + 2);
      const end = close === -1 ? text.length : close + 2;
      for (let cursor = index; cursor < end; cursor += 1) {
        if (blanked[cursor] !== '\n') blanked[cursor] = ' ';
      }
      index = end;
      continue;
    }
    if (text.startsWith('//', index)) {
      const newline = text.indexOf('\n', index + 2);
      const end = newline === -1 ? text.length : newline;
      for (let cursor = index; cursor < end; cursor += 1) blanked[cursor] = ' ';
      index = end;
      continue;
    }
    index += 1;
  }
  return blanked.join('');
}

/** The pattern that matches `folder` with no name character on either side. */
function ownFolderPattern(folder: string): RegExp {
  return new RegExp(`(?<!${NAME_EDGE})${escapeRegExp(folder)}(?!${NAME_EDGE})`, 'u');
}

/**
 * The 1-based line numbers where `text` names `folder`, after blanking `//` and
 * block comments. Each matching line counts once.
 *
 * @scenario watcher-and-harness: Own folder lines
 * @adr 002
 * @adr 006
 */
export function findOwnFolderLines(text: string, folder: string): number[] {
  if (folder.length === 0) return [];
  const pattern = ownFolderPattern(folder);
  const lines = blankComments(text).split('\n');
  const found: number[] = [];
  for (const [index, line] of lines.entries()) {
    if (pattern.test(line)) found.push(index + 1);
  }
  return found;
}

/** Project-relative POSIX form, so a scope path never depends on the host. */
function toPosix(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
}

/** The own-folder dead marker for one folder and its sorted matches. */
function formatMarker(
  folder: string,
  matches: readonly { readonly path: string; readonly line: number }[],
): string {
  const lines = matches.map((match) => `- ${match.path}:${match.line}`).join('\n');
  return `---\nreason: own_folder_path\n---\nThese files name this change's folder, ${folder}, whose path changes when the change archives:\n${lines}\nReach the change folder through the OSQ_CHANGE environment variable.\n`;
}

/**
 * Read every changed scope file outside `openspec/` and return the violation
 * naming each line that hard-codes the change's own folder, or null when none
 * does.
 *
 * @scenario watcher-and-harness: Task naming its own folder dies
 * @adr 002
 * @adr 006
 */
export async function checkOwnFolderGate(
  projectRoot: string,
  files: readonly string[],
  folder: string,
): Promise<OwnFolderViolation | null> {
  const matches: { path: string; line: number }[] = [];
  for (const relativePath of files) {
    const normalized = toPosix(relativePath);
    if (normalized === 'openspec' || normalized.startsWith('openspec/')) continue;
    const content = await fs.readFile(path.join(projectRoot, normalized), 'utf8').catch(() => null);
    if (content === null) continue;
    for (const line of findOwnFolderLines(content, folder)) {
      matches.push({ path: normalized, line });
    }
  }
  if (matches.length === 0) return null;
  matches.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
  const error = `Files name the change folder ${folder}: ${matches
    .map((match) => `${match.path}:${match.line}`)
    .join(', ')}`;
  return { reason: 'own_folder_path', marker: formatMarker(folder, matches), error };
}
