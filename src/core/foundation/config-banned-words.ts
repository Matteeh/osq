/**
 * A word a project bans from its code, and the `scope`-style globs the ban
 * covers.
 */
export interface BannedWord {
  readonly word: string;
  readonly paths: readonly string[];
}

const ERROR = 'bannedWords must be a list of { word, paths } entries';

/**
 * Resolve the optional `bannedWords` key. Absence keeps no bans; a list keeps
 * each entry's `word` and every glob trimmed; anything that is not a list of
 * entries with a non-empty `word` and a non-empty `paths` list of non-empty
 * strings is rejected.
 *
 * @scenario cli-foundation: No banned words by default
 * @scenario cli-foundation: A project bans words
 * @scenario cli-foundation: Invalid banned words
 */
export function validateBannedWordsConfig(raw: unknown): readonly BannedWord[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error(ERROR);
  const entries: BannedWord[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) throw new Error(ERROR);
    const { word, paths } = entry as { word?: unknown; paths?: unknown };
    if (typeof word !== 'string' || word.trim() === '') throw new Error(ERROR);
    if (!Array.isArray(paths) || paths.length === 0) throw new Error(ERROR);
    const trimmedPaths: string[] = [];
    for (const glob of paths) {
      if (typeof glob !== 'string' || glob.trim() === '') throw new Error(ERROR);
      trimmedPaths.push(glob.trim());
    }
    entries.push({ word: word.trim(), paths: trimmedPaths });
  }
  return entries;
}
