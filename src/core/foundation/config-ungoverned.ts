/**
 * The path globs osq does not govern by default: the prose and local files a
 * project usually edits directly. A project's own list replaces these, and the
 * empty list governs every path.
 */
export const DEFAULT_UNGOVERNED: readonly string[] = [
  'README*',
  'docs/**',
  'LICENSE*',
  '.gitignore',
  '.env*',
];

/**
 * Resolve the optional `ungoverned` key. Absence keeps the default; a list is
 * kept trimmed and replaces the default; anything that is not an array of
 * non-empty strings is rejected.
 *
 * @scenario cli-foundation: Default ungoverned paths
 * @scenario cli-foundation: A project list replaces the default
 * @scenario cli-foundation: Invalid ungoverned
 */
export function validateUngovernedConfig(raw: unknown): readonly string[] {
  if (raw === undefined) return DEFAULT_UNGOVERNED;
  if (!Array.isArray(raw)) throw new Error('ungoverned must be a list of path globs');
  const entries: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      throw new Error('ungoverned must be a list of path globs');
    }
    entries.push(entry.trim());
  }
  return entries;
}
