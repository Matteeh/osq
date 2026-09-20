import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { harnessBinary, probeVersion } from './config-doctor.js';
import { DEFAULT_CONFIG, type OsqConfig, loadConfig } from './config.js';
import { OSQ_END_MARKER, OSQ_START_MARKER } from './init.js';
import { getArchiveDir, getChangesDir } from './layout.js';
import { OPENSPEC_EXPECTED_VERSION } from './linter.js';
import { isPidRunning } from './lock.js';
import { parseFrontmatter } from './parser.js';

export interface DoctorCheckResult {
  name: string;
  ok: boolean;
  message: string;
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
    !!config.timeouts
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

async function checkHarness(projectRoot: string, config: OsqConfig): Promise<DoctorCheckResult> {
  const bin = harnessBinary(config);
  if (bin === null) return make('harness', true, 'no external executable required');
  try {
    const timeoutSeconds = config.timeouts.harnessPreflightSeconds ?? 10;
    const version = await probeVersion(bin, projectRoot, timeoutSeconds);
    return make('harness', true, `${bin} ${version}`.trim());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return make('harness', false, `binary unavailable: ${bin} (${message})`);
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
    const version = raw.trim();
    if (version === OPENSPEC_EXPECTED_VERSION) {
      return make('validator', true, `pinned ${OPENSPEC_EXPECTED_VERSION}`);
    }
    return make(
      'validator',
      false,
      `openspec version ${version} differs from pinned ${OPENSPEC_EXPECTED_VERSION}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return make('validator', false, `binary unavailable: openspec (${message})`);
  }
}

// PLANNER.md is osq-owned and must carry a block. AGENTS.md is often
// hand-authored: no markers means unmanaged, a partial/reversed pair is drift.
async function checkManagedBlocks(projectRoot: string): Promise<DoctorCheckResult> {
  const failures: string[] = [];
  let agentsManaged = true;
  for (const file of ['AGENTS.md', 'PLANNER.md']) {
    const fullPath = path.join(projectRoot, file);
    if (!(await exists(fullPath))) {
      failures.push(`${file} missing`);
      continue;
    }
    const content = await fs.readFile(fullPath, 'utf8');
    const start = content.indexOf(OSQ_START_MARKER);
    const end = content.indexOf(OSQ_END_MARKER);
    if (start === -1 && end === -1) {
      if (file === 'PLANNER.md') failures.push(`${file} missing managed block`);
      else agentsManaged = false;
    } else if (start === -1 || end === -1 || end < start) {
      failures.push(`${file} has a malformed managed block`);
    }
  }
  if (failures.length > 0) {
    return make('managed-blocks', false, failures.join('; '));
  }
  return make(
    'managed-blocks',
    true,
    agentsManaged ? 'managed blocks valid' : 'managed blocks valid (AGENTS.md unmanaged)',
  );
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
  const checks = [
    configCheck,
    await checkHarness(projectRoot, config),
    await checkManagedBlocks(projectRoot),
    await checkLocks(projectRoot, config),
    await checkArchives(projectRoot, config),
    await checkDoneMarkers(projectRoot, config),
    await checkValidator(projectRoot, deps),
  ];
  return { ok: checks.every((check) => check.ok), checks };
}
