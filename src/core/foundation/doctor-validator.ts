import { readValidatorFailing } from '../status/validator-failing.js';
import { validatorRunConfig } from './config-validator.js';
import type { OsqConfig } from './config.js';
import type { DoctorCheckResult } from './doctor.js';
import { findHarness, normalizeHarnessName, resolveExecutorIdentity } from './harness-catalog.js';

/** The executor's `harness` probe, reused for the validator's harness. */
export type HarnessProbe = (
  projectRoot: string,
  config: OsqConfig,
) => Promise<{ check: DoctorCheckResult; version: string }>;

/**
 * The validator's harness checks, added when its harness differs from the
 * executor's: the same probe the executor's `harness` check uses, named
 * `validator-harness`, then each catalog `diagnose` result named
 * `validator-<name>` after a passing probe. A validator on the executor's
 * harness, a disabled validator, or no validator adds none, because the
 * executor's own `harness` checks already cover that binary.
 *
 * @scenario cli-foundation: Validator harness below its floor
 * @scenario cli-foundation: Validator harness at its floor
 * @scenario cli-foundation: Validator binary missing
 * @scenario cli-foundation: Validator on the executor's harness
 * @adr 010
 */
export async function checkValidatorHarness(
  projectRoot: string,
  config: OsqConfig,
  probe: HarnessProbe,
): Promise<DoctorCheckResult[]> {
  const validator = config.validator;
  if (!validator?.enabled || validator.harness === normalizeHarnessName(config.harness)) return [];
  const runConfig = validatorRunConfig(config, validator);
  const { check, version } = await probe(projectRoot, runConfig);
  const checks: DoctorCheckResult[] = [{ ...check, name: 'validator-harness' }];
  const diagnose = check.ok ? findHarness(validator.harness)?.diagnose : undefined;
  if (!diagnose) return checks;
  for (const diagnosis of await diagnose({ config: runConfig, projectRoot, version })) {
    checks.push({
      name: `validator-${diagnosis.name}`,
      ok: diagnosis.ok,
      message: diagnosis.message,
      ...(diagnosis.warning ? { warning: true } : {}),
    });
  }
  return checks;
}

/**
 * The `validator-runs` check: a failing check naming the newest failing
 * validator run, its error, and the fix, or none when the validator is missing
 * or disabled, or no run is failing. It reads recorded runs only: no model call
 * and no write.
 *
 * @scenario cli-foundation: Validator runs fail in doctor
 * @scenario cli-foundation: Validator runs check order
 * @scenario cli-foundation: No validator, no runs check
 * @adr 010
 */
export async function checkValidatorRuns(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult[]> {
  const validator = config.validator;
  if (!validator?.enabled) return [];
  const failing = await readValidatorFailing(projectRoot, config);
  if (failing === null) return [];
  const id = failing.change.match(/^(\d+)/)?.[1] ?? failing.change;
  return [
    {
      name: 'validator-runs',
      ok: false,
      message: `validator ${failing.outcome} ${failing.runs}× in a row, last on ${id}: ${failing.error} — update the ${validator.harness} harness or change validator.model`,
    },
  ];
}

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
