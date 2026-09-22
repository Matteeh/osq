import type { PlannerConfig } from './config.js';
import { HARNESS_NAMES, findHarness } from './harness-catalog.js';

/**
 * Optional Codex CLI execution settings. Every field is optional; omitting a
 * field defers to Codex's own native configuration and defaults.
 */
export interface CodexConfig {
  readonly bin?: string;
  readonly model?: string;
  readonly effort?: string;
}

const CODEX_STRING_FIELDS = ['bin', 'model', 'effort'] as const;

/** Validate optional Codex settings, rejecting blank or non-string values. */
export function validateCodexConfig(codex: unknown): CodexConfig {
  if (codex === undefined || codex === null) {
    return {};
  }
  if (typeof codex !== 'object' || Array.isArray(codex)) {
    throw new Error('codex configuration must be an object');
  }
  const record = codex as Record<string, unknown>;
  const validated: Record<string, string> = {};
  for (const field of CODEX_STRING_FIELDS) {
    const value = record[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`codex.${field} must be a non-empty string if provided`);
    }
    validated[field] = value.trim();
  }
  return validated;
}

/**
 * Validate the optional `planner` block. Supported harness names and
 * harness-specific optional settings are derived from the canonical catalog;
 * the model is always required. Unsupported settings fail with the selected
 * harness and the offending setting named rather than being silently ignored.
 */
export function validatePlannerConfig(planner: unknown): PlannerConfig {
  if (!planner || typeof planner !== 'object') {
    throw new Error('planner configuration must be an object');
  }
  const p = planner as Record<string, unknown>;
  if (typeof p.harness !== 'string' || !p.harness.trim()) {
    throw new Error('planner.harness must be a non-empty string');
  }
  const entry = findHarness(p.harness);
  if (!entry) {
    throw new Error(
      `Unsupported planner harness: "${String(p.harness).trim()}". Must be one of: ${HARNESS_NAMES.join(
        ', ',
      )}`,
    );
  }
  if (typeof p.model !== 'string' || !p.model.trim()) {
    throw new Error('planner.model must be a non-empty string');
  }
  const model = p.model.trim();
  if (p.agent !== undefined && (typeof p.agent !== 'string' || !p.agent.trim())) {
    throw new Error('planner.agent must be a non-empty string if provided');
  }
  const agent = typeof p.agent === 'string' && p.agent.trim() ? p.agent.trim() : undefined;
  if (agent && !entry.planner.agent) {
    throw new Error(`planner.agent is unsupported for the ${entry.name} harness; remove it`);
  }

  return { harness: entry.name, model, ...(agent ? { agent } : {}) };
}

// Shared resolution lives in the canonical catalog; re-exported here so the
// 032 public surface and its call sites keep working unchanged.
export {
  resolveAdapterModel,
  resolveCodexBinary,
  resolveCodexEffort,
  resolveCodexModel,
  resolveHarnessEffort,
  resolveHarnessModel,
  resolvePlannerSelection,
} from './harness-catalog.js';
export type { PlannerSelection } from './harness-catalog.js';
