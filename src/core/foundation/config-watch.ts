/**
 * Background watch service timing and logging settings. `defineConfig`
 * validates and defaults this block here, so a consumer never sees a partial
 * watch configuration.
 */
export interface WatchConfig {
  /** The first delay before restarting a crashed watcher. */
  readonly restartDelaySeconds: number;
  /** The longest restart delay, and the run time after which the delay resets. */
  readonly restartMaxDelaySeconds: number;
  /** How old the newest `dist/` file must be before a worker restarts on it. */
  readonly buildSettleSeconds: number;
  /** How long `osq watch --stop` waits for the service to exit. */
  readonly stopWaitSeconds: number;
  /** The size at which `watch.log` is rotated. */
  readonly logMaxBytes: number;
}

export const DEFAULT_WATCH_CONFIG: WatchConfig = {
  restartDelaySeconds: 5,
  restartMaxDelaySeconds: 300,
  buildSettleSeconds: 10,
  stopWaitSeconds: 15,
  logMaxBytes: 10485760,
};

const FIELDS = [
  'restartDelaySeconds',
  'restartMaxDelaySeconds',
  'buildSettleSeconds',
  'stopWaitSeconds',
  'logMaxBytes',
] as const;

type WatchField = (typeof FIELDS)[number];

/**
 * Validate an optional `watch` block over the defaults. A partial block keeps
 * each missing default; any value that is not a finite number greater than
 * zero is rejected with an error naming its key.
 */
export function validateWatchConfig(watch: unknown): WatchConfig {
  if (watch === undefined) return DEFAULT_WATCH_CONFIG;
  if (typeof watch !== 'object' || watch === null || Array.isArray(watch)) {
    throw new Error('watch configuration must be an object');
  }
  const record = watch as Record<string, unknown>;
  const result: Record<WatchField, number> = { ...DEFAULT_WATCH_CONFIG };
  for (const field of FIELDS) {
    const value = record[field] === undefined ? DEFAULT_WATCH_CONFIG[field] : record[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new Error(`watch.${field} must be a finite number greater than zero`);
    }
    result[field] = value;
  }
  return result;
}
