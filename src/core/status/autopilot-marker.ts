/**
 * The autopilot change marker: `.run/autopilot.md` in a change folder autopilot
 * created. It records the queue item, the queue approval's hash and when the
 * change was made, then the planner start and approval times once autopilot
 * reaches them. A change without the marker belongs to a human, and autopilot
 * never plans or approves it.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseFrontmatter } from '../spec/parser.js';

/** One `.run/autopilot.md` record. */
export interface AutopilotMarker {
  /** The queue item's slug. */
  readonly item: string;
  /** The queue approval's hash autopilot ran under. */
  readonly queueApproval: string;
  /** ISO time the change was created. */
  readonly createdAt: string;
  /** ISO time autopilot started the planner. */
  readonly plannerStartedAt?: string;
  /** ISO time autopilot approved the plan. */
  readonly approvedAt?: string;
}

/** The fields `updateAutopilotMarker` adds once autopilot reaches them. */
export interface AutopilotMarkerUpdate {
  readonly plannerStartedAt?: string;
  readonly approvedAt?: string;
}

/**
 * `<changeFolder>/.run/autopilot.md`.
 *
 * @scenario status-inspection: Marker round trip
 * @adr 021
 */
export function autopilotMarkerPath(folderPath: string): string {
  return path.join(folderPath, '.run', 'autopilot.md');
}

function parseMarker(content: string): AutopilotMarker | null {
  const { data } = parseFrontmatter(content);
  const { item, queue_approval: queueApproval, created_at: createdAt } = data;
  if (typeof item !== 'string' || typeof queueApproval !== 'string') return null;
  if (typeof createdAt !== 'string') return null;
  const plannerStartedAt =
    typeof data.planner_started_at === 'string' ? data.planner_started_at : undefined;
  const approvedAt = typeof data.approved_at === 'string' ? data.approved_at : undefined;
  return {
    item,
    queueApproval,
    createdAt,
    ...(plannerStartedAt !== undefined ? { plannerStartedAt } : {}),
    ...(approvedAt !== undefined ? { approvedAt } : {}),
  };
}

/**
 * Read `.run/autopilot.md`; null for a missing or unparsable file.
 *
 * @scenario status-inspection: Marker round trip
 * @adr 021
 */
export async function readAutopilotMarker(folderPath: string): Promise<AutopilotMarker | null> {
  const content = await fs.readFile(autopilotMarkerPath(folderPath), 'utf8').catch(() => null);
  return content === null ? null : parseMarker(content);
}

/**
 * Write `.run/autopilot.md`, creating `.run/` when needed, with `item`,
 * `queue_approval` and `created_at` first, then the times autopilot reached.
 *
 * @scenario status-inspection: Marker round trip
 * @adr 021
 */
export async function writeAutopilotMarker(
  folderPath: string,
  marker: AutopilotMarker,
): Promise<void> {
  const frontmatter = YAML.stringify({
    item: marker.item,
    queue_approval: marker.queueApproval,
    created_at: marker.createdAt,
    ...(marker.plannerStartedAt !== undefined
      ? { planner_started_at: marker.plannerStartedAt }
      : {}),
    ...(marker.approvedAt !== undefined ? { approved_at: marker.approvedAt } : {}),
  }).trimEnd();
  const target = autopilotMarkerPath(folderPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `---\n${frontmatter}\n---\n`, 'utf8');
}

/**
 * Add `planner_started_at` and `approved_at` to the marker in place; null and
 * unchanged when the marker is missing or unparsable.
 *
 * @scenario status-inspection: Marker round trip
 * @adr 021
 */
export async function updateAutopilotMarker(
  folderPath: string,
  patch: AutopilotMarkerUpdate,
): Promise<AutopilotMarker | null> {
  const existing = await readAutopilotMarker(folderPath);
  if (existing === null) return null;
  const merged: AutopilotMarker = { ...existing, ...patch };
  await writeAutopilotMarker(folderPath, merged);
  return merged;
}
