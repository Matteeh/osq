import type { OsqConfig } from './config.js';
import type { DoctorCheckResult } from './doctor.js';
import { resolveExecutorIdentity } from './harness-catalog.js';

/**
 * The `validator-model` check: a warning when the validator runs on the
 * executor's harness and model, a passing check when it runs on another model,
 * or null when the validator is missing or disabled.
 */
export function checkValidatorModel(config: OsqConfig): DoctorCheckResult | null {
  const validator = config.validator;
  if (!validator?.enabled) return null;
  const executor = resolveExecutorIdentity(config);
  const { harness, model } = validator;
  if (harness === executor.harness && model === executor.model) {
    return {
      name: 'validator-model',
      ok: true,
      warning: true,
      message: `validator uses the executor's harness and model (${harness}/${model}); its findings share the executor's blind spots`,
    };
  }
  return {
    name: 'validator-model',
    ok: true,
    message: `validator ${harness}/${model}, executor ${executor.harness}/${executor.model}`,
  };
}
