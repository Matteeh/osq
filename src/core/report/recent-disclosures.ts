import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_PLANNING_CONFIG,
  type PlanningDisclosuresConfig,
} from '../foundation/config-planning.js';
import type { OsqConfig } from '../foundation/config.js';
import { getArchiveDir } from '../status/layout.js';
import { type TaskDisclosures, readChangeDisclosures } from './result-sections.js';

/** Exact heading of the plan prompt's optional disclosure section. */
export const RECENT_DISCLOSURES_HEADING = '## Recent executor disclosures';

/** Opening sentence that labels every quoted disclosure as an unverified claim. */
export const DISCLOSURES_CLAIM =
  'Executor claims from result files, not verified facts. Check them against the code before relying on them.';

/** The marker appended to the last entry when the character budget cuts it. */
export const TRUNCATION_MARKER = '[truncated]';

/** Real disclosure sections in the order they are quoted within a task. */
const DISCLOSURE_SECTIONS: readonly {
  readonly display: string;
  readonly key: 'deviated' | 'missingContext' | 'outsideScope';
}[] = [
  { display: 'deviated', key: 'deviated' },
  { display: 'missing context', key: 'missingContext' },
  { display: 'outside scope', key: 'outsideScope' },
];

function numericPrefix(name: string): number | null {
  const match = name.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/**
 * Canonical archive folders, newest numeric first, hidden entries excluded.
 * Mirrors the bounded listing in `report.ts` without importing it.
 */
async function listRecentArchiveFolders(archiveDir: string, limit: number): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(archiveDir);
  } catch {
    return [];
  }
  const folders: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const fullPath = path.join(archiveDir, entry);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (stat?.isDirectory()) folders.push(fullPath);
  }
  folders.sort((a, b) => {
    const nameA = path.basename(a);
    const nameB = path.basename(b);
    const numA = numericPrefix(nameA);
    const numB = numericPrefix(nameB);
    if (numA !== null && numB !== null) {
      if (numA !== numB) return numB - numA;
      return nameA.localeCompare(nameB);
    }
    if (numA !== null) return -1;
    if (numB !== null) return 1;
    return nameA.localeCompare(nameB);
  });
  return folders.slice(0, limit);
}

/** Prefix every line of a disclosure's text with `> ` so none reads as a heading. */
export function quoteDisclosureText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

/** One quoted disclosure entry: a label line followed by its `> `-prefixed text. */
function disclosureEntry(
  folderName: string,
  task: TaskDisclosures,
  display: string,
  key: keyof TaskDisclosures,
): string | null {
  const text = task[key];
  if (typeof text !== 'string' || text.length === 0) return null;
  return `${folderName} task ${task.task}, ${display}:\n${quoteDisclosureText(text)}`;
}

/** Cut an entry to `limit` characters, keeping the trailing `[truncated]` mark. */
export function truncateDisclosureEntry(entry: string, limit: number): string {
  if (entry.length <= limit) return entry;
  const budget = limit - TRUNCATION_MARKER.length;
  if (budget <= 0) return TRUNCATION_MARKER;
  const cut = entry.slice(0, budget).replace(/\n+$/, '');
  return `${cut}${TRUNCATION_MARKER}`;
}

/**
 * Body of the plan prompt's disclosure section, or null when the configured
 * recent archived changes hold no real executor disclosure. Entries are newest
 * change first and in task order, and total at most the configured budget.
 */
export async function formatRecentDisclosures(
  projectRoot: string,
  config: OsqConfig,
): Promise<string | null> {
  const limits: PlanningDisclosuresConfig = (config.planning ?? DEFAULT_PLANNING_CONFIG)
    .disclosures;
  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  const folders = await listRecentArchiveFolders(archiveDir, limits.recentChanges);

  const entries: string[] = [];
  for (const folder of folders) {
    const folderName = path.basename(folder);
    for (const task of await readChangeDisclosures(folder)) {
      for (const section of DISCLOSURE_SECTIONS) {
        const entry = disclosureEntry(folderName, task, section.display, section.key);
        if (entry !== null) entries.push(entry);
      }
    }
  }
  if (entries.length === 0) return null;

  const parts: string[] = [];
  let used = 0;
  for (const entry of entries) {
    const remaining = limits.maxCharacters - used;
    if (entry.length <= remaining) {
      parts.push(entry);
      used += entry.length;
      continue;
    }
    parts.push(truncateDisclosureEntry(entry, Math.max(remaining, TRUNCATION_MARKER.length)));
    break;
  }

  return `${DISCLOSURES_CLAIM}\n\n${parts.join('\n\n')}`;
}
