import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ObservedPlanningSession,
  PlanningSessionEdit,
} from '../../core/report/planning-observed.js';
import type { PlanningTurn } from '../../core/report/planning-slice.js';
import { NULL_INTERACTIVE_USAGE } from '../types.js';
import { listRolloutFiles, resolveCodexDataHome } from './codex-usage.js';

/**
 * Approval-time Codex rollout observation. Only `session_meta`, `turn_context`,
 * successful `apply_patch` calls, successful `patch_apply_end` events,
 * per-response `last_token_usage` counters, and valid timestamps contribute.
 * A `token_count` repeating the previous total adds no turn, `token_usage_record`
 * duplicates add none, missing fields stay null, change bodies are never read,
 * and prompt, response, and patch content are never retained.
 */

const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function extractPatchPaths(patch: string): string[] {
  const paths: string[] = [];
  for (const line of patch.split('\n')) {
    const match = PATCH_HEADER.exec(line);
    if (match) paths.push(match[1].trim());
  }
  return paths;
}

function isSuccessfulApplyPatch(payload: Record<string, unknown>): boolean {
  if (payload.type !== 'custom_tool_call' && payload.type !== 'function_call') return false;
  if (payload.name !== 'apply_patch') return false;
  const status = payload.status;
  if (typeof status === 'string' && status !== 'completed' && status !== 'success') return false;
  return payload.error === undefined || payload.error === null;
}

function patchText(payload: Record<string, unknown>): string | null {
  return text(payload.input) ?? text(payload.arguments);
}

/** Edited paths of a successful `patch_apply_end`; its change bodies stay unread. */
function patchApplyEndPaths(payload: Record<string, unknown>): string[] {
  if (payload.type !== 'patch_apply_end' || payload.success !== true) return [];
  const changes = asRecord(payload.changes);
  if (!changes) return [];
  return Object.keys(changes).filter((target) => target.length > 0);
}

/** A normalized signature of cumulative counters, so an exact repeat adds no turn. */
function totalSignature(counters: Record<string, unknown> | undefined): string | null {
  if (!counters) return null;
  return JSON.stringify([
    finiteNonNegative(counters.input_tokens),
    finiteNonNegative(counters.output_tokens),
    finiteNonNegative(counters.cached_input_tokens),
    finiteNonNegative(counters.cache_write_input_tokens),
    finiteNonNegative(counters.reasoning_output_tokens),
  ]);
}

/** One response's usage: input excludes cached input and never goes below zero. */
function turnUsage(counters: Record<string, unknown>) {
  const input = finiteNonNegative(counters.input_tokens);
  const cached = finiteNonNegative(counters.cached_input_tokens);
  return {
    inputTokens: input === null ? null : Math.max(0, input - (cached ?? 0)),
    outputTokens: finiteNonNegative(counters.output_tokens),
    cacheReadTokens: cached,
    cacheWriteTokens: finiteNonNegative(counters.cache_write_input_tokens),
    reasoningTokens: finiteNonNegative(counters.reasoning_output_tokens),
    cost: null,
  };
}

/** Mutable accumulator for one rollout parse. */
interface CodexState {
  sessionId: string | null;
  cwd: string | null;
  model: string | null;
  harnessVersion: string | null;
  previousTotal: string | null;
  turns: PlanningTurn[];
  pendingEdits: string[];
  pendingEditAt: string | null;
}

function queueEdit(state: CodexState, target: string, timestamp: string): void {
  state.pendingEdits.push(target);
  state.pendingEditAt = timestamp;
}

function absorbTokenCount(
  state: CodexState,
  payload: Record<string, unknown>,
  timestamp: string | null,
): void {
  const info = asRecord(payload.info);
  const last = asRecord(info?.last_token_usage);
  const total = asRecord(info?.total_token_usage);
  const signature = totalSignature(total);
  const duplicate = signature !== null && signature === state.previousTotal;
  if (signature !== null) state.previousTotal = signature;
  if (!last || duplicate || timestamp === null) return;
  state.turns.push({
    timestamp,
    model: state.model,
    ...turnUsage(last),
    edits: state.pendingEdits,
  });
  state.pendingEdits = [];
  state.pendingEditAt = null;
}

/** Fold one parsed rollout record into the accumulator. */
function absorbRecord(
  state: CodexState,
  event: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  const timestamp = validIso(event.timestamp) ?? validIso(payload.timestamp);
  if (event.type === 'session_meta') {
    state.sessionId = state.sessionId ?? text(payload.id) ?? text(payload.session_id);
    state.cwd = state.cwd ?? text(payload.cwd);
    state.model = text(payload.model) ?? state.model;
    state.harnessVersion = text(payload.cli_version) ?? state.harnessVersion;
    return;
  }
  if (event.type === 'turn_context') {
    state.cwd = state.cwd ?? text(payload.cwd);
    state.model = text(payload.model) ?? state.model;
    return;
  }
  if (event.type === 'token_usage_record') return;
  if (event.type === 'event_msg' && payload.type === 'token_count') {
    absorbTokenCount(state, payload, timestamp);
    return;
  }
  if (event.type === 'response_item' && isSuccessfulApplyPatch(payload) && timestamp) {
    const patch = patchText(payload);
    if (!patch) return;
    for (const target of extractPatchPaths(patch)) queueEdit(state, target, timestamp);
    return;
  }
  if (event.type === 'event_msg' && payload.type === 'patch_apply_end' && timestamp) {
    for (const target of patchApplyEndPaths(payload)) queueEdit(state, target, timestamp);
  }
}

/** Edits after the last turn become one final turn with null usage. */
function flushPendingEdits(state: CodexState): void {
  if (state.pendingEdits.length === 0 || state.pendingEditAt === null) return;
  state.turns.push({
    timestamp: state.pendingEditAt,
    model: state.model,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningTokens: null,
    cost: null,
    edits: state.pendingEdits,
  });
  state.pendingEdits = [];
  state.pendingEditAt = null;
}

/** Parse one Codex rollout JSONL body into an observation candidate. */
export function parseCodexObservation(content: string): ObservedPlanningSession | null {
  const state: CodexState = {
    sessionId: null,
    cwd: null,
    model: null,
    harnessVersion: null,
    previousTotal: null,
    turns: [],
    pendingEdits: [],
    pendingEditAt: null,
  };

  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const event = asRecord(parsed);
    const payload = asRecord(event?.payload);
    if (event && payload) absorbRecord(state, event, payload);
  }
  flushPendingEdits(state);

  const edits: PlanningSessionEdit[] = [];
  for (const turn of state.turns) {
    for (const raw of turn.edits) edits.push({ path: raw, timestamp: turn.timestamp });
  }

  if (!state.sessionId) return null;
  return {
    harness: 'codex',
    nativeSessionId: state.sessionId,
    sessionDir: state.cwd,
    model: state.model,
    harnessVersion: state.harnessVersion,
    sessionCost: null,
    usage: NULL_INTERACTIVE_USAGE,
    turns: state.turns,
    edits,
  };
}

/** Read every local Codex rollout below `resolveCodexDataHome()/sessions`. */
export async function readCodexPlanningSessions(): Promise<readonly ObservedPlanningSession[]> {
  const sessionsDir = path.join(resolveCodexDataHome(), 'sessions');
  const files = await listRolloutFiles(sessionsDir);
  const results: ObservedPlanningSession[] = [];
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8').catch(() => null);
    if (content === null) continue;
    const observation = parseCodexObservation(content);
    if (observation) results.push(observation);
  }
  return results;
}
