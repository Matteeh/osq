import { DEFAULT_PLANNING_CONFIG, type PlanningConfig } from '../foundation/config-planning.js';
import { type PlanRecord, type PlanningUsage, readPlanRecords } from './planning-records.js';
import { resolveChangeApprovalTime } from './planning-slice-lookup.js';
import {
  firstMatchingEdit,
  lastTurnModel,
  parseMs,
  sessionEdits,
  sessionTurns,
} from './planning-slice-turns.js';
import { type PlanningSlice, type PlanningTurn, sliceChangeOwnership } from './planning-slice.js';
import { appendPlanRecord } from './planning.js';

export type { PlanningSlice, PlanningTurn } from './planning-slice.js';
export { isSegmentContained, normalizeObservedTarget } from './planning-slice.js';
export { resolveChangeApprovalTime, resolveChangeCreationTime } from './planning-slice-lookup.js';

export interface PlanningSessionEdit {
  /** Path exactly as reported by the native tool call, absolute or relative. */
  readonly path: string;
  readonly timestamp: string;
}

/** The reader port every harness returns; turn and session fields may be absent. */
export interface ObservedPlanningSession {
  readonly harness: string;
  readonly nativeSessionId: string;
  readonly sessionDir: string | null;
  readonly model: string | null;
  /** Harness version when the transcript records one. */
  readonly harnessVersion?: string | null;
  /** Whole-session reported cost when the harness records one. */
  readonly sessionCost?: number | null;
  readonly startedAt?: string | null;
  readonly endedAt?: string | null;
  readonly usage: PlanningUsage;
  /** One entry per native model response; absent on legacy readers. */
  readonly turns?: readonly PlanningTurn[];
  /** Legacy edit list used only when `turns` is absent. */
  readonly edits: readonly PlanningSessionEdit[];
}

/** Independent local reader for one harness. Failure degrades to no matches. */
export type PlanningSessionReader = () => Promise<readonly ObservedPlanningSession[]>;

/** A session reduced to the turns the selected change owns. */
export interface PlanningObservation {
  readonly harness: string;
  readonly nativeSessionId: string;
  readonly sessionId: string;
  readonly model: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly usage: PlanningUsage;
  readonly slice: PlanningSlice;
}

export interface FindPlanningSessionsOptions {
  /** Persisted change creation time; invalid or absent yields no matches. */
  readonly createdAt: string | null;
  /** Single captured observation end. */
  readonly observedAt: string;
  /** Directory holding the session's change folders and their `archive/`. */
  readonly changesDir?: string;
  /** Resolved planning measurement settings. */
  readonly planning?: PlanningConfig;
  readonly readers: readonly PlanningSessionReader[];
}

export interface AppendObservedOptions {
  /** SHA-256 digest of the current `brief.md` bytes. */
  readonly briefHash: string;
  readonly osqVersion: string;
}

/** Fixed reader order so appended records are deterministic. */
const HARNESS_ORDER = ['codex', 'opencode', 'claude'] as const;

function harnessRank(harness: string): number {
  const index = HARNESS_ORDER.indexOf(harness as (typeof HARNESS_ORDER)[number]);
  return index === -1 ? HARNESS_ORDER.length : index;
}

/** Stable observed session id derived from reader name and native id. */
export function observedSessionId(harness: string, nativeSessionId: string): string {
  return `observed:${harness}:${nativeSessionId}`;
}

function compareObservations(a: PlanningObservation, b: PlanningObservation): number {
  const rank = harnessRank(a.harness) - harnessRank(b.harness);
  if (rank !== 0) return rank;
  const start = a.startedAt.localeCompare(b.startedAt);
  if (start !== 0) return start;
  return a.nativeSessionId.localeCompare(b.nativeSessionId);
}

/** Ask every reader for sessions editing inside the change during the window. */
export async function findPlanningSessions(
  changeFolder: string,
  options: FindPlanningSessionsOptions,
): Promise<PlanningObservation[]> {
  const createdMs = parseMs(options.createdAt);
  const observedMs = parseMs(options.observedAt);
  if (createdMs === null || observedMs === null || observedMs < createdMs) return [];
  const approvedAt = options.observedAt;
  const planning = options.planning ?? DEFAULT_PLANNING_CONFIG;
  const approvalCache = new Map<string, string | null>();

  const bySessionId = new Map<string, PlanningObservation>();
  for (const reader of options.readers) {
    let candidates: readonly ObservedPlanningSession[];
    try {
      candidates = await reader();
    } catch {
      continue;
    }
    if (!Array.isArray(candidates)) continue;
    const ordered = [...candidates].sort((a, b) =>
      (a.nativeSessionId ?? '').localeCompare(b.nativeSessionId ?? ''),
    );
    for (const candidate of ordered) {
      if (!candidate?.harness || !candidate?.nativeSessionId) continue;
      const sessionDir = candidate.sessionDir ?? null;
      const edit = firstMatchingEdit(
        sessionEdits(candidate),
        sessionDir,
        changeFolder,
        createdMs,
        observedMs,
      );
      if (!edit) continue;
      const sessionId = observedSessionId(candidate.harness, candidate.nativeSessionId);
      if (bySessionId.has(sessionId)) continue;
      const result = await sliceChangeOwnership({
        changeFolder,
        changesDir: options.changesDir ?? null,
        sessionId,
        sessionDir,
        approvedAt,
        turns: sessionTurns(candidate),
        sessionCost: candidate.sessionCost ?? candidate.usage?.cost ?? null,
        sessionUsage: candidate.turns === undefined ? (candidate.usage ?? null) : null,
        idleGapMinutes: planning.idleGapMinutes,
        ...(planning.prices ? { prices: planning.prices } : {}),
        resolveApproval: (folder, id) => resolveChangeApprovalTime(folder, id, approvalCache),
      });
      if (!result) continue;
      const sessionModel = candidate.model && candidate.model.length > 0 ? candidate.model : null;
      bySessionId.set(sessionId, {
        harness: candidate.harness,
        nativeSessionId: candidate.nativeSessionId,
        sessionId,
        model: lastTurnModel(result.ownedTurns) ?? sessionModel,
        startedAt: result.slice.start,
        endedAt: result.slice.end,
        usage: result.usage,
        slice: result.slice,
      });
    }
  }
  return [...bySessionId.values()].sort(compareObservations);
}

function observedWallSeconds(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / 1000;
}

/** Append one deterministic observed pair per native session, idempotently. */
export async function appendObservedSessions(
  changeFolder: string,
  observations: readonly PlanningObservation[],
  options: AppendObservedOptions,
): Promise<number> {
  if (observations.length === 0) return 0;
  const existing = new Set(
    (await readPlanRecords(changeFolder))
      .filter((record: PlanRecord) => record.type === 'plan_started')
      .map((record) => record.sessionId),
  );
  let appended = 0;
  for (const observation of observations) {
    if (existing.has(observation.sessionId)) continue;
    existing.add(observation.sessionId);
    await appendPlanRecord(changeFolder, {
      type: 'plan_started',
      sessionId: observation.sessionId,
      timestamp: observation.startedAt,
      source: 'observed',
      data: {
        harness: observation.harness,
        model: observation.model,
        osqVersion: options.osqVersion,
        briefHash: options.briefHash,
      },
    });
    await appendPlanRecord(changeFolder, {
      type: 'plan_exited',
      sessionId: observation.sessionId,
      timestamp: observation.endedAt,
      source: 'observed',
      data: {
        exitCode: null,
        wallSeconds: observedWallSeconds(observation.startedAt, observation.endedAt),
        usage: observation.usage,
        slice: observation.slice,
      },
    });
    appended++;
  }
  return appended;
}
