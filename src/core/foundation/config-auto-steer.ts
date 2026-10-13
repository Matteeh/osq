import type { OsqConfig } from './config.js';
import { findHarness, resolvePlannerSelection } from './harness-catalog.js';

/** Default wall-time budget for one automatic steering run. */
export const DEFAULT_AUTO_STEER_TIMEOUT_SECONDS = 1800;

/** The resolved `autoSteer` block from `osq.config.ts`. */
export interface AutoSteerConfig {
  readonly enabled: boolean;
  readonly timeoutSeconds?: number;
}

const AUTO_STEER_KEYS: readonly string[] = ['enabled', 'timeoutSeconds'];

function resolveTimeout(raw: unknown): number {
  const timeoutSeconds = raw === undefined ? DEFAULT_AUTO_STEER_TIMEOUT_SECONDS : raw;
  if (
    typeof timeoutSeconds !== 'number' ||
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds <= 0
  ) {
    throw new Error('autoSteer.timeoutSeconds must be a positive number');
  }
  return timeoutSeconds;
}

/**
 * Resolve the optional `autoSteer` block. Keys are checked first, then
 * `enabled`, then `timeoutSeconds`, so the first error is predictable.
 *
 * @scenario cli-foundation: Auto steer values
 * @adr 018
 */
export function validateAutoSteerConfig(raw: unknown): AutoSteerConfig | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('autoSteer must be an object');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!AUTO_STEER_KEYS.includes(key)) {
      throw new Error(`autoSteer.${key} is not supported`);
    }
  }
  const enabled = record.enabled === undefined ? false : record.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error('autoSteer.enabled must be a boolean');
  }
  const timeoutSeconds = resolveTimeout(record.timeoutSeconds);
  return { enabled, timeoutSeconds };
}

/**
 * The config the steering planner's adapter runs with: `harness` set to the
 * harness `resolvePlannerSelection` selects and, when that harness's catalog
 * entry names a config section, that section's `model` and `agent` set to the
 * selection's model and agent where the selection has them. Every other field
 * is unchanged.
 *
 * @scenario cli-foundation: Planner run config from the planner block
 * @scenario cli-foundation: Planner run config without a planner block
 * @adr 018
 */
export function plannerRunConfig(config: OsqConfig): OsqConfig {
  const selection = resolvePlannerSelection(config);
  const entry = findHarness(selection.harness);
  const base: OsqConfig = { ...config, harness: selection.harness };
  if (!entry?.configKey) return base;
  const section = config[entry.configKey] as Record<string, unknown> | undefined;
  return {
    ...base,
    [entry.configKey]: {
      ...(section ?? {}),
      ...(selection.model !== undefined ? { model: selection.model } : {}),
      ...(selection.agent !== undefined ? { agent: selection.agent } : {}),
    },
  };
}
