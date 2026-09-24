import path from 'node:path';
import { type SpecData, parseSpecMdFromFolder } from '../spec/parser.js';
import { compareNumericPrefix } from '../status/state.js';

/** One fixed change with the sorted ids of the active/archived changes fixing it. */
export interface ReworkEntry {
  readonly change: string;
  readonly fixedBy: readonly string[];
}

/**
 * The padded numeric id of a change folder name, falling back to the full name
 * when it carries no numeric prefix. `fixes` values are normalized the same way.
 */
export function changeIdOfFolder(folderPath: string): string {
  const name = path.basename(folderPath);
  const match = /^(\d+)/.exec(name);
  return match ? match[1].padStart(3, '0') : name;
}

/**
 * Every active or archived change named in another active or archived change's
 * `fixes`, ordered by change id with sorted fixer ids. Rejected folders are
 * never read, so a rejected change fixes nothing.
 */
export async function collectRework(folders: readonly string[]): Promise<ReworkEntry[]> {
  const fixedBy = new Map<string, Set<string>>();
  for (const folderPath of folders) {
    const spec: SpecData | null = await parseSpecMdFromFolder(folderPath).catch(() => null);
    if (!spec || spec.fixes.length === 0) continue;
    const fixer = changeIdOfFolder(folderPath);
    for (const fixed of spec.fixes) {
      let fixers = fixedBy.get(fixed);
      if (!fixers) {
        fixers = new Set<string>();
        fixedBy.set(fixed, fixers);
      }
      fixers.add(fixer);
    }
  }

  return [...fixedBy.entries()]
    .map(([change, fixers]) => ({ change, fixedBy: [...fixers].sort(compareNumericPrefix) }))
    .sort((a, b) => compareNumericPrefix(a.change, b.change));
}

/** Render the `Rework:` section body, one line per fixed change or `(none)`. */
export function formatRework(entries: readonly ReworkEntry[]): string[] {
  const lines = ['Rework:'];
  if (entries.length === 0) {
    lines.push('  (none)');
    return lines;
  }
  for (const entry of entries) {
    lines.push(`  ${entry.change}: fixed by ${entry.fixedBy.join(', ')}`);
  }
  return lines;
}
