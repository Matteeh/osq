/**
 * Task-boundary verification gates. `changeVerifyAfterTask` runs the change's
 * proposal verify after each passing task verify; it defaults on so every
 * completed task leaves the full change verifier green.
 */
export interface GatesConfig {
  readonly changeVerifyAfterTask: boolean;
}

export const DEFAULT_GATES_CONFIG: GatesConfig = {
  changeVerifyAfterTask: true,
};

/**
 * Validate an optional `gates` block over the defaults. A partial block keeps
 * the missing toggle's default; a present non-boolean value is rejected.
 */
export function validateGatesConfig(gates: unknown): GatesConfig {
  if (gates === undefined) return DEFAULT_GATES_CONFIG;
  if (typeof gates !== 'object' || gates === null || Array.isArray(gates)) {
    throw new Error('gates configuration must be an object with boolean gates');
  }
  const record = gates as Record<string, unknown>;
  const value =
    record.changeVerifyAfterTask === undefined
      ? DEFAULT_GATES_CONFIG.changeVerifyAfterTask
      : record.changeVerifyAfterTask;
  if (typeof value !== 'boolean') {
    throw new Error('gates.changeVerifyAfterTask must be a boolean');
  }
  return { changeVerifyAfterTask: value };
}
