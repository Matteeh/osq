/**
 * Read-only dashboard server settings. Every value is validated and defaulted
 * here so `defineConfig` owns the merged public configuration.
 */

/** The `osq server` settings nested under `serve.server`. */
export interface ServeServerConfig {
  /** Loopback port `osq server` binds, 1 through 65535. */
  readonly port: number;
  /** Seconds between the server worker's build checks. */
  readonly buildCheckSeconds: number;
  /** Name the dashboard shows; `os.hostname()` when unset. */
  readonly name?: string;
  /** Path segment of `/p/<project>/`; the project folder's name when unset. */
  readonly project?: string;
}

export interface ServeConfig {
  /** Loopback port; `0` requests an operating-system-assigned port. */
  readonly port: number;
  /** Debounce window for filesystem invalidation notifications. */
  readonly eventDebounceMs: number;
  /** Host names the write guard accepts besides loopback. */
  readonly allowedHosts: readonly string[];
  /** The `osq server` settings. */
  readonly server: ServeServerConfig;
}

export const DEFAULT_SERVE_CONFIG: ServeConfig = {
  port: 4173,
  eventDebounceMs: 100,
  allowedHosts: [],
  server: { port: 4174, buildCheckSeconds: 30 },
};

/** A valid selected port is an integer from 0 through 65535 inclusive. */
export function isValidPort(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 65535;
}

/** The project path segment: a letter or digit, then letters, digits, `.`, `_`, `-`. */
const PROJECT_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Validate `allowedHosts`: an array of host names, each `name` or `name:port`. */
function validateAllowedHosts(value: unknown): readonly string[] {
  const error = 'serve.allowedHosts must be an array of host names';
  if (value === undefined) return DEFAULT_SERVE_CONFIG.allowedHosts;
  if (!Array.isArray(value)) throw new Error(error);
  for (const entry of value) {
    if (
      typeof entry !== 'string' ||
      entry.length === 0 ||
      /\s/.test(entry) ||
      entry.includes('/')
    ) {
      throw new Error(error);
    }
  }
  return value;
}

/** Validate an optional `serve.server` block over its own defaults. */
function validateServerConfig(value: unknown): ServeServerConfig {
  if (
    value !== undefined &&
    (typeof value !== 'object' || value === null || Array.isArray(value))
  ) {
    throw new Error('serve.server must be an object');
  }
  const record = (value ?? {}) as Record<string, unknown>;
  const defaults = DEFAULT_SERVE_CONFIG.server;
  const port = record.port === undefined ? defaults.port : record.port;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('serve.server.port must be an integer from 1 through 65535');
  }
  const buildCheckSeconds =
    record.buildCheckSeconds === undefined ? defaults.buildCheckSeconds : record.buildCheckSeconds;
  if (
    typeof buildCheckSeconds !== 'number' ||
    !Number.isFinite(buildCheckSeconds) ||
    buildCheckSeconds <= 0
  ) {
    throw new Error('serve.server.buildCheckSeconds must be a finite number greater than zero');
  }
  const name = record.name;
  if (name !== undefined && (typeof name !== 'string' || name.length === 0)) {
    throw new Error('serve.server.name must be a non-empty string');
  }
  const project = record.project;
  if (project !== undefined && (typeof project !== 'string' || !PROJECT_SEGMENT.test(project))) {
    throw new Error(
      "serve.server.project must start with a letter or digit and hold only letters, digits, '.', '_' or '-'",
    );
  }
  return {
    port,
    buildCheckSeconds,
    ...(name !== undefined ? { name } : {}),
    ...(project !== undefined ? { project } : {}),
  };
}

/**
 * Validate an optional `serve` block over the defaults. A partial block keeps
 * the missing value's default; non-finite, fractional, negative, or
 * out-of-range ports and non-finite or negative debounce values are rejected.
 *
 * @scenario cli-foundation: Server defaults
 * @scenario cli-foundation: Partial server block
 * @scenario cli-foundation: Invalid server values
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
  return {
    port,
    eventDebounceMs,
    allowedHosts: validateAllowedHosts(record.allowedHosts),
    server: validateServerConfig(record.server),
  };
}
