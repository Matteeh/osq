import { changeIdOfFolder } from './record-rework.js';
import { type DisclosureCounts, countChangeDisclosures } from './result-sections.js';

/** One change with at least one executor disclosure, by change id. */
export interface DisclosureEntry extends DisclosureCounts {
  readonly change: string;
}

/**
 * Every active or archived change whose task result files hold a real
 * `## Deviated`, `## Missing context`, or `## Outside scope` section, ordered by
 * change id. A change with no such section is absent.
 */
export async function collectDisclosures(folders: readonly string[]): Promise<DisclosureEntry[]> {
  const entries: DisclosureEntry[] = [];
  for (const folderPath of folders) {
    const counts = await countChangeDisclosures(folderPath);
    if (counts.deviated + counts.missingContext + counts.outsideScope === 0) continue;
    entries.push({ change: changeIdOfFolder(folderPath), ...counts });
  }
  return entries.sort((a, b) => a.change.localeCompare(b.change));
}

/** Render the `Executor disclosures:` section body, or `(none)`. */
export function formatDisclosures(entries: readonly DisclosureEntry[]): string[] {
  const lines = ['Executor disclosures:'];
  if (entries.length === 0) {
    lines.push('  (none)');
    return lines;
  }
  for (const entry of entries) {
    lines.push(
      `  ${entry.change}: deviated ${entry.deviated}, missing context ${entry.missingContext}, outside scope ${entry.outsideScope}`,
    );
  }
  return lines;
}
