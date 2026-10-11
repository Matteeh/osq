/**
 * The recent changes of a capability page: the archived changes whose delta
 * writes the capability, newest first. They are read through
 * `listArchivedChanges` and never written back.
 */

import type { OsqConfig } from '../core/foundation/config.js';
import { type ArchivedChangeRecord, listArchivedChanges } from '../core/report/archive-record.js';
import { collapseWhitespace } from '../core/spec/digest.js';
import type { CapabilityRecentChange } from './docs-types.js';

/** The first sentence of a goal, whitespace collapsed, or an empty string. */
function firstSentence(text: string): string {
  const collapsed = collapseWhitespace(text);
  if (collapsed === '') return '';
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(collapsed);
  return (match ? match[0] : collapsed).trim();
}

/** A record's numeric change id, or -1 when it has none. */
function changeNumber(record: ArchivedChangeRecord): number {
  const number = Number.parseInt(record.id, 10);
  return Number.isNaN(number) ? -1 : number;
}

/**
 * Every archived change, read once through `listArchivedChanges`.
 *
 * @scenario docs: Pages of the docs fixture
 * @adr 016
 */
export async function loadArchivedRecords(
  projectRoot: string,
  config: OsqConfig,
): Promise<ArchivedChangeRecord[]> {
  return listArchivedChanges(projectRoot, config);
}

/**
 * The archived changes whose delta writes `capability`, by change number,
 * newest first, at most `limit`.
 *
 * @scenario docs: Pages of the docs fixture
 * @scenario docs: Recent change limit
 * @adr 016
 */
export function recentChangesFor(
  records: readonly ArchivedChangeRecord[],
  capability: string,
  limit: number,
): CapabilityRecentChange[] {
  return records
    .filter((record) => record.capabilities.some((entry) => entry.name === capability))
    .sort((a, b) => {
      const byNumber = changeNumber(b) - changeNumber(a);
      return byNumber !== 0 ? byNumber : a.folder.localeCompare(b.folder);
    })
    .slice(0, Math.max(limit, 0))
    .map((record) => ({
      id: record.id,
      folder: record.folder,
      archivedOn: record.archivedOn,
      goal: firstSentence(record.goal ?? ''),
    }));
}
