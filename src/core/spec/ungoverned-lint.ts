import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { scopeCoversPath } from '../run/scope.js';
import { readDeltaOwnership } from './capability-impact.js';
import { parseDelta } from './delta.js';
import { type LintFinding, makeFinding } from './lint-findings.js';

/**
 * The ungoverned-path half of impact lint: a change's own delta specs warned
 * when their Code ownership globs or requirement text reach paths the config
 * lists as ungoverned. Every finding is a warning; none affects `valid`,
 * `osq lint`'s exit code, or approval. Living specs are never checked.
 */

/** Characters stripped from a word's ends before it is matched as a path. */
const SURROUNDING_QUOTES = new Set(['`', "'", '"', '(', ')', '[', ']', '<', '>', '{', '}']);
const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':']);
const GLOB_CHARACTERS = /[*?[\]{}]/;

export interface UngovernedLintInput {
  readonly projectRoot: string;
  readonly folderPath: string;
  /** The resolved config's `ungoverned` list, empty when it governs nothing. */
  readonly ungoverned: readonly string[];
}

/** A delta spec's repository-relative path, from its capability's directory. */
function deltaRepoPath(projectRoot: string, folderPath: string, capability: string): string {
  return path
    .relative(projectRoot, path.join(folderPath, 'specs', capability, 'spec.md'))
    .split(path.sep)
    .join('/');
}

/**
 * True when a Code ownership glob reaches an ungoverned path: the config's
 * `ungoverned` globs match the glob read as a path, or the glob matches an
 * `ungoverned` glob read as a path.
 */
function globMatchesUngoverned(ungoverned: readonly string[], glob: string): boolean {
  if (scopeCoversPath(ungoverned, glob)) return true;
  return ungoverned.some((pattern) => scopeCoversPath([glob], pattern));
}

/** Warn once per Code ownership source glob in a change's delta spec that */
async function collectOwnershipWarnings(input: UngovernedLintInput): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  if (input.ungoverned.length === 0) return findings;

  for (const ownership of await readDeltaOwnership(input.folderPath)) {
    const file = deltaRepoPath(input.projectRoot, input.folderPath, ownership.capability);
    for (const glob of ownership.globs) {
      if (!globMatchesUngoverned(input.ungoverned, glob)) continue;
      findings.push(
        makeFinding(
          'warning',
          { file },
          `${ownership.capability} Code ownership glob ${glob} matches ungoverned paths. Ungoverned files belong to no capability; drop the glob`,
        ),
      );
    }
  }

  return findings;
}

/**
 * Strip surrounding backticks, quotes and brackets and trailing `.,;:` from
 * one whitespace-separated token, repeatedly, so `(a.md).` reads as `a.md`.
 */
function cleanWord(token: string): string {
  let word = token;
  let changed = true;
  while (changed) {
    changed = false;
    while (word.length > 0 && SURROUNDING_QUOTES.has(word[0])) {
      word = word.slice(1);
      changed = true;
    }
    while (word.length > 0 && SURROUNDING_QUOTES.has(word[word.length - 1])) {
      word = word.slice(0, -1);
      changed = true;
    }
    while (word.length > 0 && TRAILING_PUNCTUATION.has(word[word.length - 1])) {
      word = word.slice(0, -1);
      changed = true;
    }
  }
  return word;
}

/**
 * The ungoverned files a requirement's raw text names: every word that, once
 * cleaned, holds no glob character and that `ungoverned` matches. Sorted,
 * unique, and joined with `, `.
 */
function ungovernedFilesInText(raw: string, ungoverned: readonly string[]): string[] {
  const files = new Set<string>();
  for (const token of raw.split(/\s+/)) {
    const word = cleanWord(token);
    if (word.length === 0) continue;
    if (GLOB_CHARACTERS.test(word)) continue;
    if (scopeCoversPath(ungoverned, word)) files.add(word);
  }
  return [...files].sort();
}

/**
 * Warn once per ADDED or MODIFIED requirement other than Code ownership in a
 * change's delta spec whose text names an ungoverned file, on that delta
 * spec's repository-relative path and carrying the requirement name.
 */
async function collectNameWarnings(input: UngovernedLintInput): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  if (input.ungoverned.length === 0) return findings;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(path.join(input.folderPath, 'specs'), { withFileTypes: true });
  } catch {
    return findings;
  }

  const capabilities = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const capability of capabilities) {
    const content = await fs
      .readFile(path.join(input.folderPath, 'specs', capability, 'spec.md'), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    const delta = parseDelta(content);
    const file = deltaRepoPath(input.projectRoot, input.folderPath, capability);
    for (const requirement of [...delta.added, ...delta.modified]) {
      if (requirement.name === 'Code ownership') continue;
      const files = ungovernedFilesInText(requirement.raw, input.ungoverned);
      if (files.length === 0) continue;
      findings.push(
        makeFinding(
          'warning',
          { file, requirement: requirement.name },
          `${capability} requirement "${requirement.name}" names ungoverned files: ${files.join(', ')}. Ungoverned files are not pinned by specs`,
        ),
      );
    }
  }

  return findings;
}

/**
 * Run every ungoverned check for a change folder: the ownership warnings
 * "Ungoverned ownership warning" describes and the requirement name warnings
 * "Ungoverned name warning" describes. All are warnings and never block.
 */
export async function collectUngovernedFindings(
  input: UngovernedLintInput,
): Promise<LintFinding[]> {
  return [...(await collectOwnershipWarnings(input)), ...(await collectNameWarnings(input))];
}
