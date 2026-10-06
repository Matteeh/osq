/**
 * Task-boundary verification gates. `changeVerifyAfterTask` runs the change's
 * proposal verify after each passing task verify; it defaults on so every
 * completed task leaves the full change verifier green. `preSpawnVerify`
 * controls whether a task's verify runs once before its first attempt.
 * `autoRetries` bounds how many automatic retries the watcher may spend on a
 * dead task before a human must intervene; zero disables them. The
 * `provider*` keys govern provider outage deaths: how long an open provider
 * retry may last before the agent is stopped, and the wait and budget of the
 * automatic retries that follow. `commitRetries` bounds the catch-ups the
 * watcher tries after a `commit_failed` halt before a human must run
 * `osq retry <id> change`; zero turns the catch-up after a halt off.
 */
export type PreSpawnVerifyMode = 'warn' | 'fail' | 'off';

export interface GatesConfig {
  readonly changeVerifyAfterTask: boolean;
  readonly preSpawnVerify?: PreSpawnVerifyMode;
  readonly autoRetries?: number;
  /** Catch-ups after a `commit_failed` halt before a human must retry. */
  readonly commitRetries?: number;
  /** Seconds an open provider retry may last before the watcher stops the agent; 0 disables. */
  readonly providerStallSeconds?: number;
  /** Automatic retries a provider outage earns before a human must intervene. */
  readonly providerRetries?: number;
  /** Seconds to wait after a provider outage death before retrying it. */
  readonly providerRetryDelaySeconds?: number;
  /** The command the watcher runs as a change's baseline, when configured. */
  readonly baselineVerify?: string;
}

export const DEFAULT_GATES_CONFIG: GatesConfig = {
  changeVerifyAfterTask: true,
  preSpawnVerify: 'warn',
  autoRetries: 1,
  commitRetries: 2,
  providerStallSeconds: 300,
  providerRetries: 3,
  providerRetryDelaySeconds: 300,
};

/** Read a non-negative integer gate over its default, naming the key otherwise. */
function nonNegativeInteger(
  record: Record<string, unknown>,
  key: string,
  fallback: number | undefined,
): number {
  const raw = record[key] === undefined ? fallback : record[key];
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) {
    throw new Error(`gates.${key} must be a non-negative integer`);
  }
  return raw;
}

const PRE_SPAWN_VERIFY_MODES: readonly PreSpawnVerifyMode[] = ['warn', 'fail', 'off'];

/**
 * Validate an optional `gates` block over the defaults. A partial block keeps
 * each missing gate's default; a present value outside the gate's type is
 * rejected.
 */
export function validateGatesConfig(gates: unknown): GatesConfig {
  if (gates === undefined) return DEFAULT_GATES_CONFIG;
  if (typeof gates !== 'object' || gates === null || Array.isArray(gates)) {
    throw new Error('gates configuration must be an object');
  }
  const record = gates as Record<string, unknown>;
  const value =
    record.changeVerifyAfterTask === undefined
      ? DEFAULT_GATES_CONFIG.changeVerifyAfterTask
      : record.changeVerifyAfterTask;
  if (typeof value !== 'boolean') {
    throw new Error('gates.changeVerifyAfterTask must be a boolean');
  }
  const preSpawnRaw =
    record.preSpawnVerify === undefined
      ? DEFAULT_GATES_CONFIG.preSpawnVerify
      : record.preSpawnVerify;
  if (!PRE_SPAWN_VERIFY_MODES.includes(preSpawnRaw as PreSpawnVerifyMode)) {
    throw new Error('gates.preSpawnVerify must be one of warn, fail, off');
  }
  const autoRetries = nonNegativeInteger(record, 'autoRetries', DEFAULT_GATES_CONFIG.autoRetries);
  const commitRetries = nonNegativeInteger(
    record,
    'commitRetries',
    DEFAULT_GATES_CONFIG.commitRetries,
  );
  const providerStallSeconds = nonNegativeInteger(
    record,
    'providerStallSeconds',
    DEFAULT_GATES_CONFIG.providerStallSeconds,
  );
  const providerRetries = nonNegativeInteger(
    record,
    'providerRetries',
    DEFAULT_GATES_CONFIG.providerRetries,
  );
  const providerRetryDelaySeconds = nonNegativeInteger(
    record,
    'providerRetryDelaySeconds',
    DEFAULT_GATES_CONFIG.providerRetryDelaySeconds,
  );
  let baselineVerify: string | undefined;
  if (record.baselineVerify !== undefined) {
    if (typeof record.baselineVerify !== 'string' || record.baselineVerify.trim().length === 0) {
      throw new Error('gates.baselineVerify must be a non-empty command');
    }
    baselineVerify = record.baselineVerify.trim();
  }
  return {
    changeVerifyAfterTask: value,
    preSpawnVerify: preSpawnRaw as PreSpawnVerifyMode,
    autoRetries,
    commitRetries,
    providerStallSeconds,
    providerRetries,
    providerRetryDelaySeconds,
    ...(baselineVerify !== undefined ? { baselineVerify } : {}),
  };
}
