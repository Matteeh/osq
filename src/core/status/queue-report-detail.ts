import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { readPlanRecords } from '../report/planning.js';
import { parseFrontmatter } from '../spec/parser.js';
import {
  getChangesDir,
  getDeadMarkerPath,
  getRegressedMarkerPath,
  getRejectedMarkerPath,
} from './layout.js';
import type {
  QueueActiveFailure,
  QueueAssociationGroups,
  QueueItemState,
  QueueRow,
} from './queue.js';
import { compareNumericPrefix } from './state.js';

/** The queue-specific spend aggregate carried in the delivery report. */
export interface QueueReportPlanning {
  readonly sessions: number;
  readonly cost: number;
  readonly costCoverageComplete: boolean;
}

/** One current queue item with its derived state and nullable planned-to-landed time. */
export interface QueueReportItem {
  readonly slug: string;
  readonly title: string;
  readonly state: QueueItemState;
  readonly change: string | null;
  readonly rejectionCount: number;
  readonly changedSincePlanned: boolean;
  readonly plannedToLandedSeconds: number | null;
}

/** One active dead or regressed target associated with the queue. */
export interface QueueReportFailure {
  readonly change: string;
  readonly target: string;
  readonly reason: string;
}

/** One retained rejected queue attempt, preserved per folder. */
export interface QueueReportRejection {
  readonly slug: string;
  readonly change: string;
  readonly reason: string;
  readonly timestamp: string | null;
}

/** The stable top-level queue view of the delivery report. */
export interface QueueReport {
  readonly configured: boolean;
  readonly landed: number;
  readonly total: number;
  readonly planning: QueueReportPlanning;
  readonly items: readonly QueueReportItem[];
  readonly failures: readonly QueueReportFailure[];
  readonly rejections: readonly QueueReportRejection[];
}

const UNAVAILABLE = 'unavailable';

/** Deterministic empty projection used when no queue file is configured. */
export function emptyQueueReport(): QueueReport {
  return {
    configured: false,
    landed: 0,
    total: 0,
    planning: { sessions: 0, cost: 0, costCoverageComplete: false },
    items: [],
    failures: [],
    rejections: [],
  };
}

function finiteTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Rounded non-negative seconds between two endpoints, or null when missing or reversed. */
function elapsedSeconds(startMs: number | null, endMs: number | null): number | null {
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 1000);
}

/** Earliest valid `plan_started` timestamp across every attempt for one item. */
async function earliestPlanStartMs(
  groups: QueueAssociationGroups | undefined,
): Promise<number | null> {
  if (!groups) return null;
  let earliest: number | null = null;
  for (const assoc of [...groups.active, ...groups.archived, ...groups.rejected]) {
    for (const record of await readPlanRecords(assoc.folderPath)) {
      if (record.type !== 'plan_started') continue;
      const ms = finiteTimestamp(record.timestamp);
      if (ms !== null && (earliest === null || ms < earliest)) earliest = ms;
    }
  }
  return earliest;
}

/** Timestamp of the first valid typed `archived` event in a change-level stream. */
async function archivedEventMs(folderPath: string): Promise<number | null> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const event = parsed as Record<string, unknown>;
    if (event.type !== 'archived') continue;
    const ms = finiteTimestamp(event.timestamp);
    if (ms !== null) return ms;
  }
  return null;
}

/** Project one derived queue row, deriving elapsed time only for a landed association. */
export async function readQueueReportItem(
  row: QueueRow,
  groups: QueueAssociationGroups | undefined,
): Promise<QueueReportItem> {
  let plannedToLandedSeconds: number | null = null;
  const archivedRow = row.state === 'landed' || row.state === 'verification-pending';
  if (archivedRow && groups?.archived.length === 1) {
    plannedToLandedSeconds = elapsedSeconds(
      await earliestPlanStartMs(groups),
      await archivedEventMs(groups.archived[0].folderPath),
    );
  }
  return {
    slug: row.slug,
    title: row.title,
    state: row.state,
    change: row.changeId,
    rejectionCount: row.rejectionCount,
    changedSincePlanned: row.changedSincePlanned,
    plannedToLandedSeconds,
  };
}

/** Non-empty `reason` frontmatter from a marker, or null when absent or malformed. */
async function markerReason(markerPath: string): Promise<string | null> {
  const content = await fs.readFile(markerPath, 'utf8').catch(() => null);
  if (content === null) return null;
  const value = parseFrontmatter(content).data.reason;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Enrich one active failure with its canonical marker reason. */
export async function readQueueReportFailure(
  projectRoot: string,
  config: OsqConfig,
  failure: QueueActiveFailure,
): Promise<QueueReportFailure> {
  const folderPath = path.join(
    getChangesDir(config.paths.openspecRoot, projectRoot),
    failure.folderName,
  );
  const candidates =
    failure.target === 'change'
      ? [getRegressedMarkerPath(folderPath, 'change')]
      : [
          getRegressedMarkerPath(folderPath, failure.target),
          getDeadMarkerPath(folderPath, failure.target),
        ];
  for (const candidate of candidates) {
    const reason = await markerReason(candidate);
    if (reason !== null) return { change: failure.changeId, target: failure.target, reason };
  }
  return { change: failure.changeId, target: failure.target, reason: UNAVAILABLE };
}

/** One retained rejection row per rejected queue attempt, sorted by numeric change. */
export async function readQueueReportRejections(
  associations: ReadonlyMap<string, QueueAssociationGroups>,
): Promise<QueueReportRejection[]> {
  const rows: QueueReportRejection[] = [];
  for (const [slug, groups] of associations) {
    for (const assoc of groups.rejected) {
      const content = await fs
        .readFile(getRejectedMarkerPath(assoc.folderPath), 'utf8')
        .catch(() => null);
      let reason = UNAVAILABLE;
      let timestamp: string | null = null;
      if (content !== null) {
        const data = parseFrontmatter(content).data;
        if (typeof data.reason === 'string' && data.reason.trim()) reason = data.reason.trim();
        if (typeof data.timestamp === 'string' && data.timestamp.trim()) {
          timestamp = data.timestamp.trim();
        }
      }
      rows.push({ slug, change: assoc.folderName, reason, timestamp });
    }
  }
  return rows.sort((a, b) => compareNumericPrefix(a.change, b.change));
}
