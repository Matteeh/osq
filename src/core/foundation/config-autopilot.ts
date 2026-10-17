/** The resolved `autopilot` block from `osq.config.ts`. */
export interface AutopilotConfig {
  readonly enabled: boolean;
}

const AUTOPILOT_KEYS: readonly string[] = ['enabled'];

/**
 * Resolve the optional `autopilot` block. Keys are checked first, then
 * `enabled`, so the first error is predictable.
 *
 * @scenario cli-foundation: Autopilot values
 * @adr 021
 */
export function validateAutopilotConfig(raw: unknown): AutopilotConfig | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('autopilot must be an object');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!AUTOPILOT_KEYS.includes(key)) {
      throw new Error(`autopilot.${key} is not supported`);
    }
  }
  const enabled = record.enabled === undefined ? false : record.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error('autopilot.enabled must be a boolean');
  }
  return { enabled };
}
