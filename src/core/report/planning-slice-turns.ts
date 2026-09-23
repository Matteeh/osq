import type { ObservedPlanningSession, PlanningSessionEdit } from './planning-observed.js';
import { type PlanningTurn, normalizeObservedTarget } from './planning-slice.js';

/** An ISO timestamp, or null when absent or unparseable. */
export function validIso(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

/** Milliseconds of a valid ISO timestamp, or null. */
export function parseMs(value: string | null): number | null {
  const iso = validIso(value);
  return iso === null ? null : Date.parse(iso);
}

/** Edits of a session: each turn's edits, or the legacy `edits` list. */
export function sessionEdits(session: ObservedPlanningSession): readonly PlanningSessionEdit[] {
  if (session.turns === undefined) return session.edits ?? [];
  const edits: PlanningSessionEdit[] = [];
  for (const turn of session.turns) {
    for (const raw of turn.edits) edits.push({ path: raw, timestamp: turn.timestamp });
  }
  return edits;
}

/** One turn per edit with null usage when a reader reports no turns. */
export function sessionTurns(session: ObservedPlanningSession): readonly PlanningTurn[] {
  if (session.turns !== undefined) return session.turns;
  return (session.edits ?? []).map((edit) => ({
    timestamp: edit.timestamp,
    model: session.model,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    cost: null,
    edits: [edit.path],
  }));
}

/** First in-window edit whose normalized target is inside the change folder. */
export function firstMatchingEdit(
  edits: readonly PlanningSessionEdit[],
  sessionDir: string | null,
  changeFolder: string,
  createdMs: number,
  observedMs: number,
): PlanningSessionEdit | null {
  const sorted = [...edits].sort(
    (a, b) => a.timestamp.localeCompare(b.timestamp) || a.path.localeCompare(b.path),
  );
  for (const edit of sorted) {
    const editMs = parseMs(edit.timestamp);
    if (editMs === null || editMs < createdMs || editMs > observedMs) continue;
    if (normalizeObservedTarget(edit.path, sessionDir, changeFolder) === null) continue;
    return edit;
  }
  return null;
}

/** The last owned turn's model, or null when there is no owned turn. */
export function lastTurnModel(turns: readonly PlanningTurn[]): string | null {
  if (turns.length === 0) return null;
  return turns[turns.length - 1].model;
}
