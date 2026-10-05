import type { OsqConfig } from './config.js';
import { HARNESS_NAMES, findHarness } from './harness-catalog.js';

/** Default wall-time budget for one validator run. */
export const DEFAULT_VALIDATOR_TIMEOUT_SECONDS = 900;

/** The resolved `validator` block from `osq.config.ts`. */
export interface ValidatorConfig {
  readonly enabled: boolean;
  readonly harness: string;
  readonly model: string;
  readonly timeoutSeconds: number;
}

const VALIDATOR_KEYS: readonly string[] = ['enabled', 'harness', 'model', 'timeoutSeconds'];

function harnessError(): Error {
  return new Error(`validator.harness must be one of: ${HARNESS_NAMES.join(', ')}`);
}

function resolveHarness(raw: unknown, enabled: boolean): string {
  if (raw === undefined) {
    if (enabled) throw harnessError();
    return '';
  }
  if (typeof raw !== 'string') throw harnessError();
  const entry = findHarness(raw);
  if (!entry) throw harnessError();
  return entry.name;
}

function resolveModel(raw: unknown, enabled: boolean): string {
  if (raw === undefined) {
    if (enabled) throw new Error('validator.model must be a non-empty string');
    return '';
  }
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('validator.model must be a non-empty string');
  }
  return raw.trim();
}

function resolveTimeout(raw: unknown): number {
  const timeoutSeconds = raw === undefined ? DEFAULT_VALIDATOR_TIMEOUT_SECONDS : raw;
  if (
    typeof timeoutSeconds !== 'number' ||
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds <= 0
  ) {
    throw new Error('validator.timeoutSeconds must be a positive number');
  }
  return timeoutSeconds;
}

/**
 * Resolve the optional `validator` block. Keys are checked first, then
 * `enabled`, `harness`, `model`, and `timeoutSeconds`, so the first error is
 * predictable. The model never falls back to the executor's or `OSQ_MODEL`.
 */
export function validateValidatorConfig(raw: unknown): ValidatorConfig | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('validator must be an object');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!VALIDATOR_KEYS.includes(key)) {
      throw new Error(`validator.${key} is not supported`);
    }
  }
  const enabled = record.enabled === undefined ? true : record.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error('validator.enabled must be a boolean');
  }
  const harness = resolveHarness(record.harness, enabled);
  const model = resolveModel(record.model, enabled);
  const timeoutSeconds = resolveTimeout(record.timeoutSeconds);
  return { enabled, harness, model, timeoutSeconds };
}

/**
 * The config the validator's adapter runs with: `harness` set to the
 * validator's harness and, when its catalog entry names a config section, that
 * section's `model` set to the validator's model. Every other field is
 * unchanged.
 */
export function validatorRunConfig(config: OsqConfig, validator: ValidatorConfig): OsqConfig {
  const entry = findHarness(validator.harness);
  const base: OsqConfig = { ...config, harness: validator.harness };
  if (!entry?.configKey) return base;
  const section = config[entry.configKey] as Record<string, unknown> | undefined;
  return { ...base, [entry.configKey]: { ...(section ?? {}), model: validator.model } };
}
