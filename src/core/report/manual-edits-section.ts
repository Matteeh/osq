/**
 * The plan prompt's `## Manual edits` section: the manual edits a human kept
 * with `osq manual` whose capabilities no archived change has written since,
 * so the next planner can bring the specs in line. osq never blocks, warns, or
 * writes a lint finding, notice or event from these records.
 */

import type { OsqConfig } from '../foundation/config.js';
import { readManualEditRecords } from '../vcs/manual-records.js';
import { type ArchivedChangeRecord, listArchivedChanges } from './archive-record.js';

/** Exact heading of the plan prompt's optional manual-edits section. */
export const MANUAL_EDITS_HEADING = '## Manual edits';

/** Opening line of the manual-edits section body. */
export const MANUAL_EDITS_INTRO =
  'Edits a human kept with osq manual after the last change that wrote these capabilities. When this change writes one of them, bring its spec in line with the edit.';

/** Whether an archived change's time is later than the record's keep time. */
function archivedAfter(archivedAt: string | null, keptAt: string): boolean {
  if (archivedAt === null) return false;
  const end = Date.parse(archivedAt);
  const start = Date.parse(keptAt);
  if (Number.isFinite(end) && Number.isFinite(start)) return end > start;
  return archivedAt > keptAt;
}

/** A capability is open when no archived change wrote it later than `keptAt`. */
function capabilityOpen(
  capability: string,
  keptAt: string,
  archived: readonly ArchivedChangeRecord[],
): boolean {
  return !archived.some(
    (change) =>
      change.capabilities.some((entry) => entry.name === capability) &&
      archivedAfter(change.archivedAt, keptAt),
  );
}

/** The first line of a comment, keeping multi-line comments to one line. */
function firstCommentLine(comment: string): string {
  return comment.split(/\r?\n/, 1)[0] ?? '';
}

/**
 * The body of the plan prompt's manual-edits section: the intro line then one
 * line per record with an open capability, in `kept_at` order, or null when no
 * record has one.
 *
 * @scenario metrics-and-reporting: Open manual edits
 * @scenario metrics-and-reporting: No open manual edits
 * @adr 008
 */
export async function formatManualEditsSection(
  projectRoot: string,
  config: OsqConfig,
): Promise<string | null> {
  const records = await readManualEditRecords(projectRoot, config);
  if (records.length === 0) return null;
  const archived = await listArchivedChanges(projectRoot, config);

  const lines: string[] = [];
  for (const record of records) {
    const open = record.capabilities.filter((capability) =>
      capabilityOpen(capability, record.keptAt, archived),
    );
    if (open.length === 0) continue;
    lines.push(
      `- ${record.keptAt} ${open.join(', ')}: ${firstCommentLine(record.comment)} (${record.paths.join(', ')})`,
    );
  }
  if (lines.length === 0) return null;
  return `${MANUAL_EDITS_INTRO}\n${lines.join('\n')}`;
}

/**
 * The prompt with the `## Manual edits` section appended last, or the prompt
 * unchanged when no record has an open capability.
 *
 * @scenario metrics-and-reporting: No open manual edits
 * @adr 008
 */
export async function appendManualEditsSection(
  prompt: string,
  projectRoot: string,
  config: OsqConfig,
): Promise<string> {
  const body = await formatManualEditsSection(projectRoot, config);
  return body === null ? prompt : `${prompt}\n\n${MANUAL_EDITS_HEADING}\n\n${body}`;
}
