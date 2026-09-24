/**
 * Capability name resemblance and living-capability discovery for the approval
 * digest. A new capability resembles a living one when their names are equal
 * once hyphens and underscores are removed, when one name's words all appear
 * among the other's, or when both are long enough and their edit distance is
 * small.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIN_EDIT_DISTANCE_LENGTH = 5;
const MAX_EDIT_DISTANCE = 2;

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Words of a name, split on hyphens and underscores. */
function words(name: string): string[] {
  return name.split(/[-_]+/).filter((word) => word !== '');
}

function stripSeparators(name: string): string {
  return name.replace(/[-_]/g, '');
}

function isSubset(a: readonly string[], b: readonly string[]): boolean {
  const other = new Set(b);
  return a.every((word) => other.has(word));
}

/** Levenshtein edit distance between two names. */
function editDistance(a: string, b: string): number {
  const previous: number[] = [];
  for (let j = 0; j <= b.length; j += 1) previous.push(j);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return previous[b.length];
}

/** True when two capability names resemble each other. */
export function namesResemble(name: string, other: string): boolean {
  if (stripSeparators(name) === stripSeparators(other)) return true;
  const nameWords = words(name);
  const otherWords = words(other);
  if (nameWords.length > 0 && otherWords.length > 0) {
    if (isSubset(nameWords, otherWords) || isSubset(otherWords, nameWords)) return true;
  }
  if (name.length >= MIN_EDIT_DISTANCE_LENGTH && other.length >= MIN_EDIT_DISTANCE_LENGTH) {
    return editDistance(name, other) <= MAX_EDIT_DISTANCE;
  }
  return false;
}

/** The first living name, in name order, that `name` resembles, or null. */
export function resemblingCapability(name: string, living: readonly string[]): string | null {
  const ordered = [...living].sort(compareText);
  return ordered.find((candidate) => namesResemble(name, candidate)) ?? null;
}

/**
 * Living capability names: the directories under `<openspecRoot>/specs` that
 * hold a `spec.md`, in name order.
 */
export async function readLivingCapabilityNames(
  projectRoot: string,
  openspecRoot: string,
): Promise<string[]> {
  const specsDir = path.join(projectRoot, openspecRoot, 'specs');
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const exists = await fs
      .stat(path.join(specsDir, entry.name, 'spec.md'))
      .then(() => true)
      .catch(() => false);
    if (exists) names.push(entry.name);
  }
  return names.sort(compareText);
}
