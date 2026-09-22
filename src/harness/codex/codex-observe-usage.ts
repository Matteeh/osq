import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  ObservedPlanningSession,
  PlanningSessionEdit,
} from '../../core/report/planning-observed.js';
import { type InteractiveUsage, NULL_INTERACTIVE_USAGE } from '../types.js';
import { listRolloutFiles, resolveCodexDataHome } from './codex-usage.js';

/**
 * Approval-time Codex rollout observation. A rollout is read defensively and
 * only `session_meta`, `turn_context`, successful `apply_patch` custom calls,
 * cumulative token counters, and valid record timestamps contribute. Arbitrary
 * shell command text is never interpreted as an edit and missing fields stay
 * null. Prompt, response, and patch content are never retained.
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

function usageFromCounters(counters: Record<string, unknown>): InteractiveUsage {
  return {
    inputTokens: finiteNonNegative(counters.input_tokens),
    outputTokens: finiteNonNegative(counters.output_tokens),
    cachedTokens: finiteNonNegative(counters.cached_input_tokens),
    reasoningTokens: finiteNonNegative(counters.reasoning_output_tokens),
    cost: null,
  };
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

/** Parse one Codex rollout JSONL body into an observation candidate. */
export function parseCodexObservation(content: string): ObservedPlanningSession | null {
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let model: string | null = null;
  let startedAt: string | null = null;
  let endedAt: string | null = null;
  let usage: InteractiveUsage = NULL_INTERACTIVE_USAGE;
  const edits: PlanningSessionEdit[] = [];

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
    if (!event || !payload) continue;

    const timestamp = validIso(event.timestamp) ?? validIso(payload.timestamp);
    if (timestamp) {
      if (startedAt === null || timestamp < startedAt) startedAt = timestamp;
      if (endedAt === null || timestamp > endedAt) endedAt = timestamp;
    }

    if (event.type === 'session_meta') {
      sessionId = sessionId ?? text(payload.id) ?? text(payload.session_id);
      cwd = cwd ?? text(payload.cwd);
      model = model ?? text(payload.model);
      continue;
    }
    if (event.type === 'turn_context') {
      cwd = cwd ?? text(payload.cwd);
      model = model ?? text(payload.model);
      continue;
    }
    if (event.type === 'token_usage_record') {
      const counters = asRecord(payload.thread_token_usage);
      if (counters) usage = usageFromCounters(counters);
      continue;
    }
    if (event.type === 'event_msg' && payload.type === 'token_count') {
      const info = asRecord(payload.info);
      const counters = asRecord(info?.total_token_usage);
      if (counters) usage = usageFromCounters(counters);
      continue;
    }
    if (event.type === 'response_item' && isSuccessfulApplyPatch(payload) && timestamp) {
      const patch = patchText(payload);
      if (!patch) continue;
      for (const target of extractPatchPaths(patch)) {
        edits.push({ path: target, timestamp });
      }
    }
  }

  if (!sessionId) return null;
  return {
    harness: 'codex',
    nativeSessionId: sessionId,
    sessionDir: cwd,
    model,
    startedAt,
    endedAt,
    usage,
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
