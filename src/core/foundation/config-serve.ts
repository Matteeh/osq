/**
 * Read-only dashboard server settings. Both values are validated and defaulted
 * here so `defineConfig` owns the merged public configuration.
 */
export interface ServeConfig {
  /** Loopback port; `0` requests an operating-system-assigned port. */
  readonly port: number;
  /** Debounce window for filesystem invalidation notifications. */
  readonly eventDebounceMs: number;
}

export const DEFAULT_SERVE_CONFIG: ServeConfig = {
  port: 4173,
  eventDebounceMs: 100,
};

/** A valid selected port is an integer from 0 through 65535 inclusive. */
export function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 65535;
}

/**
 * Validate an optional `serve` block over the defaults. A partial block keeps
 * the missing value's default; non-finite, fractional, negative, or
 * out-of-range ports and non-finite or negative debounce values are rejected.
 */
export function validateServeConfig(serve: unknown): ServeConfig {
  if (serve === undefined) return DEFAULT_SERVE_CONFIG;
  if (typeof serve !== 'object' || serve === null || Array.isArray(serve)) {
    throw new Error('serve configuration must be an object with port and eventDebounceMs');
  }
  const record = serve as Record<string, unknown>;
  const port = record.port === undefined ? DEFAULT_SERVE_CONFIG.port : record.port;
  const eventDebounceMs =
    record.eventDebounceMs === undefined
      ? DEFAULT_SERVE_CONFIG.eventDebounceMs
      : record.eventDebounceMs;
  if (typeof port !== 'number' || !isValidPort(port)) {
    throw new Error('serve.port must be an integer from 0 through 65535');
  }
  if (
    typeof eventDebounceMs !== 'number' ||
    !Number.isFinite(eventDebounceMs) ||
    eventDebounceMs < 0
  ) {
    throw new Error('serve.eventDebounceMs must be a finite non-negative number');
  }
  return { port, eventDebounceMs };
}
