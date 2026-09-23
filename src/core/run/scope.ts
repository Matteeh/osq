import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Version of the deterministic scope resolver. Consumers that persist scope
 * evidence record this value so legacy and resolver-2 artifacts stay distinct.
 */
export const SCOPE_RESOLVER_VERSION = 2;

/**
 * One resolved scope entry. `relativePath` is always a normalized
 * project-relative POSIX path, while `absolutePath` is the readable path of an
 * existing regular file or `null` for a missing exact declaration.
 */
export interface ResolvedScopeEntry {
  readonly relativePath: string;
  readonly absolutePath: string | null;
}

/** Glob metacharacters that distinguish a pattern from an exact declaration. */
const GLOB_METACHARACTER_REGEX = /[*?]/;

/** Normalize a raw scope entry to a trimmed, POSIX, project-relative form. */
function normalizeScopeEntry(entry: string): string {
  return entry
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '');
}

/** A pattern is a glob or a trailing-directory form; everything else is exact. */
function isPatternEntry(normalized: string): boolean {
  return GLOB_METACHARACTER_REGEX.test(normalized) || normalized.endsWith('/');
}

/** Normalize a path to a project-relative POSIX string. */
function relativePosix(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

/**
 * Translate a scope glob into an anchored regular expression. Supports `*`
 * (within one path segment), `**` (across segments), and `?`; a trailing `/`
 * expands to that directory's recursive contents.
 */
function globToRegExp(glob: string): RegExp {
  let normalized = normalizeScopeEntry(glob);
  if (normalized.endsWith('/')) {
    normalized = `${normalized}**`;
  }
  normalized = normalized.replace(/\/+$/, '');

  let source = '^';
  let index = 0;
  while (index < normalized.length) {
    const char = normalized[index];
    if (char === '*') {
      if (normalized[index + 1] === '*') {
        index += 2;
        if (normalized[index] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        index += 1;
        source += '[^/]*';
      }
    } else if (char === '?') {
      index += 1;
      source += '[^/]';
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      index += 1;
    }
  }

  return new RegExp(`${source}$`);
}

/**
 * True when a list of declared scope entries covers one project-relative path:
 * the path equals an exact entry, or a glob or trailing-directory entry matches
 * it through the same `globToRegExp` translation the resolver uses. This is a
 * pure predicate; it never touches the filesystem.
 */
export function scopeCoversPath(scope: readonly string[], relativePath: string): boolean {
  const normalizedPath = normalizeScopeEntry(relativePath);

  for (const rawEntry of scope) {
    if (typeof rawEntry !== 'string') continue;
    const normalizedEntry = normalizeScopeEntry(rawEntry);
    if (normalizedEntry === normalizedPath) {
      return true;
    }
    if (isPatternEntry(normalizedEntry) && globToRegExp(normalizedEntry).test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

/**
 * The project-relative directory a pattern can possibly match beneath. Walking
 * only this prefix keeps resolution proportional to the declared scope rather
 * than the whole project tree.
 */
function patternSearchRoot(normalized: string): string {
  if (!GLOB_METACHARACTER_REGEX.test(normalized)) {
    return normalized.replace(/\/+$/, '');
  }
  const firstMeta = normalized.search(GLOB_METACHARACTER_REGEX);
  const prefix = normalized.slice(0, firstMeta);
  const lastSlash = prefix.lastIndexOf('/');
  return lastSlash === -1 ? '' : prefix.slice(0, lastSlash);
}

/** True when `relative` stays strictly inside the project root. */
function staysInsideProject(relative: string): boolean {
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !relative.startsWith('../') &&
    !path.isAbsolute(relative)
  );
}

/** Recursively list every regular file under `root` as a project-relative path. */
async function listFilesUnder(projectRoot: string, root: string): Promise<string[]> {
  const base = root === '' ? projectRoot : path.join(projectRoot, root);
  const files: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const ordered = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of ordered) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        files.push(relativePosix(projectRoot, full));
      }
    }
  };

  await walk(base);
  return files.sort();
}

function compareResolved(a: ResolvedScopeEntry, b: ResolvedScopeEntry): number {
  if (a.relativePath < b.relativePath) return -1;
  if (a.relativePath > b.relativePath) return 1;
  return 0;
}

/**
 * Resolve scope declarations against the project tree deterministically. Exact
 * declarations contribute their existing regular file or a null-valued entry
 * when missing; glob and trailing-directory declarations contribute every
 * matching regular file. Results are deduplicated, lexically sorted
 * project-relative POSIX entries and never escape the project root.
 */
export async function resolveScope(
  projectRoot: string,
  scope: readonly string[],
): Promise<ResolvedScopeEntry[]> {
  const results = new Map<string, ResolvedScopeEntry>();
  const walkCache = new Map<string, string[]>();

  const add = (relativePath: string, absolutePath: string | null): void => {
    if (!results.has(relativePath)) {
      results.set(relativePath, { relativePath, absolutePath });
    }
  };

  for (const rawEntry of scope) {
    if (typeof rawEntry !== 'string') continue;
    const normalized = normalizeScopeEntry(rawEntry);

    if (isPatternEntry(normalized)) {
      const root = patternSearchRoot(normalized);
      if (!staysInsideProject(root)) continue;
      const regex = globToRegExp(normalized);
      let files = walkCache.get(root);
      if (files === undefined) {
        files = await listFilesUnder(projectRoot, root);
        walkCache.set(root, files);
      }
      for (const relative of files) {
        if (regex.test(relative)) {
          add(relative, path.join(projectRoot, relative));
        }
      }
      continue;
    }

    const resolved = path.resolve(projectRoot, normalized);
    if (!staysInsideProject(path.relative(projectRoot, resolved))) {
      add(normalized, null);
      continue;
    }
    const stat = await fs.lstat(resolved).catch(() => null);
    if (stat?.isFile()) {
      add(relativePosix(projectRoot, resolved), resolved);
    } else {
      add(normalized, null);
    }
  }

  return [...results.values()].sort(compareResolved);
}
