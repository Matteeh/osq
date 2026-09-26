import fs from 'node:fs/promises';
import path from 'node:path';
import { probeVersion } from '../foundation/config-doctor.js';
import type { OsqConfig } from '../foundation/config.js';
import type { DoctorCheckResult } from '../foundation/doctor.js';
import { DEFAULT_GIT_SECONDS } from './git-vcs.js';
import { selectVcs } from './select.js';
import type { Vcs } from './vcs.js';

/** Variables that redirect git and that osq's own git reads ignore. */
const GIT_ENV_KEYS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;

/** Lockfiles whose presence asks for a `vcs.prepare` install command. */
const LOCKFILES = [
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
] as const;

/** The hooks git runs during a commit; other hooks do not affect osq's commit. */
const COMMIT_HOOKS = new Set(['pre-commit', 'prepare-commit-msg', 'commit-msg', 'post-commit']);

/** The git config values git itself treats as true. */
const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);

export interface DoctorGitOptions {
  /** Override the git binary; tests use an absent path for the missing case. */
  readonly gitBinary?: string;
}

/** The redirecting variables set in osq's environment, in a stable order. */
function setGitEnvVars(): string[] {
  return GIT_ENV_KEYS.filter((key) => (process.env[key] ?? '') !== '');
}

/** The `git-env` warning naming the variables set and who ignores them. */
function gitEnvMessage(names: string[]): string {
  const subject = names.length === 1 ? `${names[0]} is set` : `${names.join(' and ')} are set`;
  const pronoun = names.length === 1 ? 'it' : 'them';
  return `${subject}; osq's own git reads ignore ${pronoun} while verify commands and hooks do not`;
}

/** The `git` check and the selected port: git's version, or a warning why off. */
async function gitCheck(
  projectRoot: string,
  config: OsqConfig,
  binary: string | undefined,
): Promise<{ check: DoctorCheckResult; vcs: Vcs }> {
  const vcs = await selectVcs(
    projectRoot,
    config,
    binary === undefined ? undefined : { gitBinary: binary },
  );
  if (vcs.kind === 'git') {
    const seconds = config.timeouts.gitSeconds ?? DEFAULT_GIT_SECONDS;
    const version = await probeVersion(binary ?? 'git', projectRoot, seconds);
    return { check: { name: 'git', ok: true, message: version }, vcs };
  }
  return {
    check: {
      name: 'git',
      ok: true,
      warning: true,
      message: `${vcs.unavailableReason}; git checks off`,
    },
    vcs,
  };
}

/** The lockfiles present at the project root, in a stable order. */
async function presentLockfiles(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  for (const file of LOCKFILES) {
    const exists = await fs.stat(path.join(projectRoot, file)).then(
      () => true,
      () => false,
    );
    if (exists) found.push(file);
  }
  return found;
}

/**
 * The three warnings shown only with `vcs.enabled` and `GitVcs`: a lockfile
 * with no `vcs.prepare`, the active commit hooks, and commit signing. Each
 * passes with a warning and never changes doctor's exit code.
 */
async function vcsWarnings(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
): Promise<DoctorCheckResult[]> {
  const warnings: DoctorCheckResult[] = [];
  const prepare = config.vcs?.prepare;
  if (prepare === undefined || prepare === '') {
    const locks = await presentLockfiles(projectRoot);
    if (locks.length > 0) {
      warnings.push({
        name: 'vcs-prepare',
        ok: true,
        warning: true,
        message: `${locks.join(', ')} found without vcs.prepare; set vcs.prepare to the install command`,
      });
    }
  }
  const hooks = (await vcs.hookNames()).filter((name) => COMMIT_HOOKS.has(name));
  if (hooks.length > 0) {
    warnings.push({
      name: 'git-hooks',
      ok: true,
      warning: true,
      message: `active commit hooks: ${hooks.join(', ')}; check each runs unattended and leaves the tree as verified`,
    });
  }
  const signing = await vcs.configValue('commit.gpgsign');
  if (signing !== null && TRUE_VALUES.has(signing.toLowerCase())) {
    warnings.push({
      name: 'git-signing',
      ok: true,
      warning: true,
      message: 'commit.gpgsign is true; check signing runs without a prompt',
    });
  }
  return warnings;
}

/**
 * The `git` doctor check, the version-control warnings, and, when a
 * redirecting variable is set, the `git-env` warning. All pass with a warning
 * and never change doctor's exit code.
 */
export async function checkGit(
  projectRoot: string,
  config: OsqConfig,
  options: DoctorGitOptions = {},
): Promise<DoctorCheckResult[]> {
  const { check, vcs } = await gitCheck(projectRoot, config, options.gitBinary);
  const checks: DoctorCheckResult[] = [check];
  if (config.vcs?.enabled === true && vcs.kind === 'git') {
    checks.push(...(await vcsWarnings(projectRoot, config, vcs)));
  }
  const set = setGitEnvVars();
  if (set.length > 0) {
    checks.push({ name: 'git-env', ok: true, warning: true, message: gitEnvMessage(set) });
  }
  return checks;
}
