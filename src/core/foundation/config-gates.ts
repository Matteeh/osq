/**
 * Task-boundary verification gates. `changeVerifyAfterTask` runs the change's
 * proposal verify after each passing task verify; it defaults on so every
 * completed task leaves the full change verifier green. `preSpawnVerify`
 * controls whether a task's verify runs once before its first attempt.
 */
export type PreSpawnVerifyMode = 'warn' | 'fail' | 'off';

export interface GatesConfig {
  readonly changeVerifyAfterTask: boolean;
  readonly preSpawnVerify?: PreSpawnVerifyMode;
}

export const DEFAULT_GATES_CONFIG: GatesConfig = {
  changeVerifyAfterTask: true,
  preSpawnVerify: 'warn',
};

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
  return {
    changeVerifyAfterTask: value,
    preSpawnVerify: preSpawnRaw as PreSpawnVerifyMode,
  };
}
