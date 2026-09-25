/**
 * Scenario traceability. `capabilities` opts capabilities in, either every
 * capability with `'all'` or a list of names; `mode` turns each finding into a
 * warning or an error; `focusedTests` is an optional command with a `{files}`
 * placeholder, left out of the resolved block when unset.
 */
export type TraceabilityMode = 'warn' | 'require';

export interface TraceabilityConfig {
  readonly capabilities: 'all' | readonly string[];
  readonly mode: TraceabilityMode;
  readonly focusedTests?: string;
}

export const DEFAULT_TRACEABILITY_CONFIG: TraceabilityConfig = {
  capabilities: [],
  mode: 'warn',
};

const TRACEABILITY_MODES: readonly TraceabilityMode[] = ['warn', 'require'];

function isCapabilities(value: unknown): value is 'all' | readonly string[] {
  if (value === 'all') return true;
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

/**
 * Validate an optional `traceability` block over the defaults. A partial block
 * keeps each missing default; a value outside its type is rejected.
 */
export function validateTraceabilityConfig(traceability: unknown): TraceabilityConfig {
  if (traceability === undefined) return DEFAULT_TRACEABILITY_CONFIG;
  if (typeof traceability !== 'object' || traceability === null || Array.isArray(traceability)) {
    throw new Error('traceability configuration must be an object');
  }
  const record = traceability as Record<string, unknown>;
  const capabilities =
    record.capabilities === undefined
      ? DEFAULT_TRACEABILITY_CONFIG.capabilities
      : record.capabilities;
  if (!isCapabilities(capabilities)) {
    throw new Error("traceability.capabilities must be 'all' or a list of capability names");
  }
  const mode = record.mode === undefined ? DEFAULT_TRACEABILITY_CONFIG.mode : record.mode;
  if (!TRACEABILITY_MODES.includes(mode as TraceabilityMode)) {
    throw new Error('traceability.mode must be one of warn, require');
  }
  const focusedTests = record.focusedTests;
  if (focusedTests !== undefined) {
    if (typeof focusedTests !== 'string' || !focusedTests.includes('{files}')) {
      throw new Error('traceability.focusedTests must be a command containing {files}');
    }
  }
  return {
    capabilities,
    mode: mode as TraceabilityMode,
    ...(focusedTests !== undefined ? { focusedTests } : {}),
  };
}
