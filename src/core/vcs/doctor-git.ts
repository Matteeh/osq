import { probeVersion } from '../foundation/config-doctor.js';
import type { OsqConfig } from '../foundation/config.js';
import type { DoctorCheckResult } from '../foundation/doctor.js';
import { DEFAULT_GIT_SECONDS } from './git-vcs.js';
import { selectVcs } from './select.js';

/** Variables that redirect git and that osq's own git reads ignore. */
const GIT_ENV_KEYS = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'] as const;

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

/** The `git` check: git's version, or a passing warning naming why checks are off. */
async function gitCheck(
  projectRoot: string,
  config: OsqConfig,
  binary: string | undefined,
): Promise<DoctorCheckResult> {
  const vcs = await selectVcs(
    projectRoot,
    config,
    binary === undefined ? undefined : { gitBinary: binary },
  );
  if (vcs.kind === 'git') {
    const seconds = config.timeouts.gitSeconds ?? DEFAULT_GIT_SECONDS;
    const version = await probeVersion(binary ?? 'git', projectRoot, seconds);
    return { name: 'git', ok: true, message: version };
  }
  return {
    name: 'git',
    ok: true,
    warning: true,
    message: `${vcs.unavailableReason}; git checks off`,
  };
}

/**
 * The `git` doctor check and, when a redirecting variable is set, the `git-env`
 * warning. Both pass with a warning and never change doctor's exit code.
 */
export async function checkGit(
  projectRoot: string,
  config: OsqConfig,
  options: DoctorGitOptions = {},
): Promise<DoctorCheckResult[]> {
  const checks = [await gitCheck(projectRoot, config, options.gitBinary)];
  const set = setGitEnvVars();
  if (set.length > 0) {
    checks.push({ name: 'git-env', ok: true, warning: true, message: gitEnvMessage(set) });
  }
  return checks;
}
