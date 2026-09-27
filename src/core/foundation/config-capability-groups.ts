/**
 * Capability group enforcement. `requireGroups` opts a project in to requiring
 * a real group for every capability a change creates or writes; it defaults
 * off, so until a project turns it on a bare name in `creates` and a missing
 * sidecar stay silent.
 */
export interface CapabilitiesConfig {
  readonly requireGroups: boolean;
}

export const DEFAULT_CAPABILITIES_CONFIG: CapabilitiesConfig = {
  requireGroups: false,
};

/**
 * Validate an optional `capabilities` block over the default. A partial block
 * keeps the default; a value outside its type is rejected.
 */
export function validateCapabilitiesConfig(capabilities: unknown): CapabilitiesConfig {
  if (capabilities === undefined) return DEFAULT_CAPABILITIES_CONFIG;
  if (typeof capabilities !== 'object' || capabilities === null || Array.isArray(capabilities)) {
    throw new Error('capabilities configuration must be an object');
  }
  const record = capabilities as Record<string, unknown>;
  const requireGroups =
    record.requireGroups === undefined
      ? DEFAULT_CAPABILITIES_CONFIG.requireGroups
      : record.requireGroups;
  if (typeof requireGroups !== 'boolean') {
    throw new Error('capabilities.requireGroups must be a boolean');
  }
  return { requireGroups };
}
