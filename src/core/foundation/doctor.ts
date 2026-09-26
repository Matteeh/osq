import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isPidRunning } from '../run/lock.js';
import {
  OPENSPEC_EXPECTED_VERSION,
  assessOpenSpecVersion,
  formatInRangeWarning,
} from '../spec/openspec-version.js';
import { parseFrontmatter } from '../spec/parser.js';
import { getArchiveDir, getChangesDir } from '../status/layout.js';
import { harnessBinary, probeVersion } from './config-doctor.js';
import { DEFAULT_CONFIG, type OsqConfig, loadConfig } from './config.js';
import { checkDecisions } from './doctor-decisions.js';
import { checkManagedBlocks } from './doctor-managed.js';
import { checkPlanningPrices } from './doctor-prices.js';
import { findHarness } from './harness-catalog.js';

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

function make(name: string, ok: boolean, message: string): DoctorCheckResult {
  return { name, ok, message };
}

const exists = (target: string): Promise<boolean> =>
  fs.stat(target).then(
    () => true,
    () => false,
  );

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

// PLANNER.md, AGENTS.md, and the Claude command all carry canonical osq
// managed blocks; doctor compares bytes, not marker presence. The opencode
// executor agent file is included when either harness selection is opencode and
// is repaired by `osq setup`, not `osq init`.
async function checkManaged(projectRoot: string, config: OsqConfig): Promise<DoctorCheckResult> {
  const result = await checkManagedBlocks(projectRoot, config);
  return make('managed-blocks', result.ok, result.message);
}

async function listDirs(root: string): Promise<string[]> {
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name));
}

async function checkLocks(projectRoot: string, config: OsqConfig): Promise<DoctorCheckResult> {
  const changesDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const orphaned: string[] = [];
  for (const changeDir of await listDirs(changesDir)) {
    const name = path.basename(changeDir);
    if (name === 'archive' || name.startsWith('_') || name.startsWith('.')) continue;
    for (const lockDirName of ['running', 'locks']) {
      const lockDir = path.join(changeDir, '.run', lockDirName);
      for (const file of await fs.readdir(lockDir).catch(() => [])) {
        if (!file.endsWith('.pid')) continue;
        const lockPath = path.join(lockDir, file);
        let pid = 0;
        try {
          pid = Number((JSON.parse(await fs.readFile(lockPath, 'utf8')) as { pid?: number }).pid);
        } catch {}
        if (!isPidRunning(pid)) orphaned.push(path.relative(projectRoot, lockPath));
      }
    }
  }
  return orphaned.length > 0
    ? make('locks', false, `orphaned lock(s): ${orphaned.join(', ')}`)
    : make('locks', true, 'no orphaned locks');
}

async function checkArchives(projectRoot: string, config: OsqConfig): Promise<DoctorCheckResult> {
  const root = getArchiveDir(config.paths.openspecRoot, projectRoot);
  const corrupt: string[] = [];
  for (const archiveDir of await listDirs(root)) {
    const hasProposal =
      (await exists(path.join(archiveDir, 'proposal.md'))) ||
      (await exists(path.join(archiveDir, 'spec.md')));
    const hasTasks =
      (await exists(path.join(archiveDir, 'tasks'))) ||
      (await exists(path.join(archiveDir, 'tasks.md')));
    if (!hasProposal || !hasTasks) corrupt.push(path.relative(projectRoot, archiveDir));
  }
  return corrupt.length > 0
    ? make('archives', false, `invalid archive(s): ${corrupt.join(', ')}`)
    : make('archives', true, 'all archives valid');
}

/** Active change done markers must be automated (`scope_hash`) or manual. */
async function checkDoneMarkers(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult> {
  const changesDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const invalid: string[] = [];
  for (const changeDir of await listDirs(changesDir)) {
    const name = path.basename(changeDir);
    if (name === 'archive' || name.startsWith('_') || name.startsWith('.')) continue;
    const doneDir = path.join(changeDir, '.run', 'done');
    for (const marker of await fs.readdir(doneDir).catch(() => [])) {
      const markerPath = path.join(doneDir, marker);
      const { data } = parseFrontmatter(await fs.readFile(markerPath, 'utf8').catch(() => ''));
      const automated = typeof data.scope_hash === 'string';
      const manual = data.manual === true && typeof data.reason === 'string';
      if (!automated && !manual) invalid.push(path.relative(projectRoot, markerPath));
    }
  }
  if (invalid.length === 0) return make('done-markers', true, 'all done markers verified');
  return make(
    'done-markers',
    false,
    `unverified done marker placed by hand: ${invalid.join(', ')}`,
  );
}

export async function runDoctorChecks(
  projectRoot: string,
  deps: DoctorDependencies = {},
): Promise<DoctorReport> {
  const { check: configCheck, config } = await checkConfig(projectRoot, deps);
  const harness = await checkHarness(projectRoot, config);
  // A catalog entry may add checks for its own executable after a passing probe.
  const diagnose = harness.check.ok ? findHarness(config.harness)?.diagnose : undefined;
  const extra = diagnose ? await diagnose({ config, projectRoot, version: harness.version }) : [];
  const decisionsCheck = await checkDecisions(projectRoot, config);
  const checks: DoctorCheckResult[] = [
    configCheck,
    harness.check,
    ...extra.map((diagnosis) => ({
      ...make(diagnosis.name, diagnosis.ok, diagnosis.message),
      ...(diagnosis.warning ? { warning: true } : {}),
    })),
    await checkManaged(projectRoot, config),
    ...(decisionsCheck ? [decisionsCheck] : []),
    await checkLocks(projectRoot, config),
    await checkArchives(projectRoot, config),
    await checkDoneMarkers(projectRoot, config),
    await checkValidator(projectRoot, deps),
  ];
  const priceCheck = await checkPlanningPrices(projectRoot, config);
  if (priceCheck) checks.push(priceCheck);
  return { ok: checks.every((check) => check.ok), checks };
}
