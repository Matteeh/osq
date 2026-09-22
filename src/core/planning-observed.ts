import fs from 'node:fs/promises';
import path from 'node:path';
import { type PlanRecord, type PlanningUsage, readPlanRecords } from './planning-records.js';
import { appendPlanRecord } from './planning.js';

export interface PlanningSessionEdit {
  /** Path exactly as reported by the native tool call, absolute or relative. */
  readonly path: string;
  readonly timestamp: string;
}

export interface ObservedPlanningSession {
  readonly harness: string;
  readonly nativeSessionId: string;
  readonly sessionDir: string | null;
  readonly model: string | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly usage: PlanningUsage;
  readonly edits: readonly PlanningSessionEdit[];
}

/** Independent local reader for one harness. Failure degrades to no matches. */
export type PlanningSessionReader = () => Promise<readonly ObservedPlanningSession[]>;

/** A session that matched the change folder and the inclusive observation window. */
export interface PlanningObservation {
  readonly harness: string;
  readonly nativeSessionId: string;
  readonly sessionId: string;
  readonly model: string | null;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly usage: PlanningUsage;
}

export interface FindPlanningSessionsOptions {
  /** Persisted change creation time; invalid or absent yields no matches. */
  readonly createdAt: string | null;
  /** Single captured observation end. */
  readonly observedAt: string;
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

function validIso(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function parseMs(value: string | null): number | null {
  const iso = validIso(value);
  return iso === null ? null : Date.parse(iso);
}

/** Segment-aware containment: a sibling prefix or `..` escape is never inside. */
export function isSegmentContained(folder: string, target: string): boolean {
  const relative = path.relative(path.resolve(folder), path.resolve(target));
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

/**
 * Resolve one raw tool path against its recorded session directory, then
 * require segment containment by the change folder.
 */
export function normalizeObservedTarget(
  raw: string,
  sessionDir: string | null,
  changeFolder: string,
): string | null {
  if (!raw) return null;
  const base = path.isAbsolute(raw) ? raw : sessionDir ? path.resolve(sessionDir, raw) : null;
  if (!base) return null;
  const normalized = path.resolve(base);
  return isSegmentContained(changeFolder, normalized) ? normalized : null;
}

/** Stable observed session id derived from reader name and native id. */
export function observedSessionId(harness: string, nativeSessionId: string): string {
  return `observed:${harness}:${nativeSessionId}`;
}

function firstMatchingEdit(
  session: ObservedPlanningSession,
  changeFolder: string,
  createdMs: number,
  observedMs: number,
): PlanningSessionEdit | null {
  const edits = [...session.edits].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.path.localeCompare(b.path),
  );
  for (const edit of edits) {
    const editMs = parseMs(edit.timestamp);
    if (editMs === null || editMs < createdMs || editMs > observedMs) continue;
    if (normalizeObservedTarget(edit.path, session.sessionDir, changeFolder) === null) continue;
    return edit;
  }
  return null;
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
      const edit = firstMatchingEdit(candidate, changeFolder, createdMs, observedMs);
      if (!edit) continue;
      const sessionId = observedSessionId(candidate.harness, candidate.nativeSessionId);
      if (bySessionId.has(sessionId)) continue;
      const startedAt = validIso(candidate.startedAt) ?? edit.timestamp;
      const endedAt = validIso(candidate.endedAt) ?? edit.timestamp;
      bySessionId.set(sessionId, {
        harness: candidate.harness,
        nativeSessionId: candidate.nativeSessionId,
        sessionId,
        model: candidate.model && candidate.model.length > 0 ? candidate.model : null,
        startedAt,
        endedAt,
        usage: candidate.usage,
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
      },
    });
    appended++;
  }
  return appended;
}

/**
 * Persisted change creation time: the initial `.run/manifest.json` `createdAt`
 * written with the change, with the folder's valid birth time as fallback.
 */
export async function resolveChangeCreationTime(changeFolder: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(changeFolder, '.run', 'manifest.json'), 'utf8');
    const createdAt = (JSON.parse(raw) as { createdAt?: unknown }).createdAt;
    const valid = validIso(typeof createdAt === 'string' ? createdAt : null);
    if (valid) return valid;
  } catch {
    // Missing or malformed manifest.
  }
  try {
    const stat = await fs.stat(changeFolder);
    const birth = stat.birthtime;
    if (birth && Number.isFinite(birth.getTime()) && birth.getTime() > 0) {
      return birth.toISOString();
    }
  } catch {
    // Unreadable folder.
  }
  return null;
}
