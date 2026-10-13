import path from 'node:path';
import {
  OPENSPEC_EXPECTED_VERSION,
  assessOpenSpecVersion,
  formatInRangeWarning,
} from '../spec/openspec-version.js';
import { checkGit } from '../vcs/doctor-git.js';
import { harnessBinary, probeVersion } from './config-doctor.js';
import { DEFAULT_CONFIG, type OsqConfig, loadConfig } from './config.js';
import { checkArchives, checkDoneMarkers, checkLocks, exists, make } from './doctor-changes.js';
import { checkDecisions } from './doctor-decisions.js';
import { checkLanguages } from './doctor-languages.js';
import { checkManagedBlocks } from './doctor-managed.js';
import { checkPlanningPrices } from './doctor-prices.js';
import {
  checkValidatorHarness,
  checkValidatorModel,
  checkValidatorRuns,
} from './doctor-validator.js';
import { findHarness } from './harness-catalog.js';
import type { HarnessContainment } from './harness-containment.js';

export interface DoctorCheckResult {
  name: string;
  ok: boolean;
  message: string;
  /** The check passed but carries a non-failing warning; printed as `[warn]`. */
  warning?: boolean;
}

export interface DoctorReport {
  ok: boolean;
  checks: DoctorCheckResult[];
}

/** Injectable seam keeps the config check hermetic under test. */
export interface DoctorDependencies {
  loadConfig?: (projectRoot: string) => Promise<OsqConfig>;
  probeValidator?: (projectRoot: string) => Promise<string>;
}

function validConfig(config: OsqConfig): boolean {
  return (
    typeof config.harness === 'string' &&
    config.harness.trim() !== '' &&
    !!config.limits &&
    !!config.paths &&
    typeof config.paths.openspecRoot === 'string' &&
    !!config.timeouts &&
    typeof config.gates?.changeVerifyAfterTask === 'boolean'
  );
}

async function checkConfig(
  projectRoot: string,
  deps: DoctorDependencies,
): Promise<{ check: DoctorCheckResult; config: OsqConfig }> {
  try {
    const config = await (deps.loadConfig ?? loadConfig)(projectRoot);
    if (!validConfig(config)) {
      return {
        check: make('config', false, 'configuration is invalid or incomplete'),
        config: DEFAULT_CONFIG,
      };
    }
    return { check: make('config', true, `loaded (harness: ${config.harness})`), config };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { check: make('config', false, `failed to load: ${message}`), config: DEFAULT_CONFIG };
  }
}

async function checkHarness(
  projectRoot: string,
  config: OsqConfig,
): Promise<{ check: DoctorCheckResult; version: string }> {
  const bin = harnessBinary(config);
  if (bin === null) {
    return { check: make('harness', true, 'no external executable required'), version: '' };
  }
  try {
    const timeoutSeconds = config.timeouts.harnessPreflightSeconds ?? 10;
    const version = await probeVersion(bin, projectRoot, timeoutSeconds);
    return { check: make('harness', true, `${bin} ${version}`.trim()), version };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      check: make('harness', false, `binary unavailable: ${bin} (${message})`),
      version: '',
    };
  }
}

async function checkValidator(
  projectRoot: string,
  deps: DoctorDependencies,
): Promise<DoctorCheckResult> {
  try {
    const local = path.join(projectRoot, 'node_modules', '.bin', 'openspec');
    const bin = (await exists(local)) ? local : 'openspec';
    const raw = deps.probeValidator
      ? await deps.probeValidator(projectRoot)
      : await probeVersion(bin, projectRoot);
    const assessment = await assessOpenSpecVersion(raw);
    if (assessment.status === 'pinned') {
      return make('validator', true, `pinned ${OPENSPEC_EXPECTED_VERSION}`);
    }
    if (assessment.status === 'in-range' && assessment.range !== null) {
      return {
        name: 'validator',
        ok: true,
        warning: true,
        message: formatInRangeWarning(assessment.version, assessment.range),
      };
    }
    return make(
      'validator',
      false,
      `openspec version ${assessment.version} differs from pinned ${OPENSPEC_EXPECTED_VERSION}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return make('validator', false, `binary unavailable: openspec (${message})`);
  }
}

// PLANNER.md, AGENTS.md, and the Claude command all carry canonical osq managed blocks; doctor compares bytes, not marker presence.
async function checkManaged(projectRoot: string, config: OsqConfig): Promise<DoctorCheckResult> {
  const result = await checkManagedBlocks(projectRoot, config);
  return make('managed-blocks', result.ok, result.message);
}

function containmentCheck(result: HarnessContainment | string): DoctorCheckResult {
  if (typeof result === 'string') return make('harness-containment', true, result);
  return {
    ...make('harness-containment', result.ok, result.message),
    ...(result.warning ? { warning: true } : {}),
  };
}

export async function runDoctorChecks(
  projectRoot: string,
  deps: DoctorDependencies = {},
): Promise<DoctorReport> {
  const { check: configCheck, config } = await checkConfig(projectRoot, deps);
  const harness = await checkHarness(projectRoot, config);
  const entry = findHarness(config.harness);
  // A catalog entry may add checks for its own executable after a passing probe.
  const diagnose = harness.check.ok ? entry?.diagnose : undefined;
  const extra = diagnose ? await diagnose({ config, projectRoot, version: harness.version }) : [];
  const containment = configCheck.ok && entry ? [containmentCheck(entry.containment(config))] : [];
  const decisionsCheck = await checkDecisions(projectRoot, config);
  const checks: DoctorCheckResult[] = [
    configCheck,
    harness.check,
    ...extra.map((diagnosis) => ({
      ...make(diagnosis.name, diagnosis.ok, diagnosis.message),
      ...(diagnosis.warning ? { warning: true } : {}),
    })),
    ...containment,
    await checkManaged(projectRoot, config),
    ...(decisionsCheck ? [decisionsCheck] : []),
    await checkLocks(projectRoot, config),
    await checkArchives(projectRoot, config),
    await checkDoneMarkers(projectRoot, config),
    await checkValidator(projectRoot, deps),
    ...(await checkGit(projectRoot, config)),
    ...(await checkLanguages(projectRoot, config)),
  ];
  const priceCheck = await checkPlanningPrices(projectRoot, config);
  checks.push(...(priceCheck ? [priceCheck] : []));
  checks.push(...(await checkValidatorRuns(projectRoot, config)));
  checks.push(...(await checkValidatorHarness(projectRoot, config, checkHarness)));
  const validatorModelCheck = checkValidatorModel(config);
  if (validatorModelCheck) checks.push(validatorModelCheck);
  return { ok: checks.every((check) => check.ok), checks };
}
