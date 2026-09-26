/**
 * Version control configuration. osq performs no git writes unless `enabled`
 * is set, so the block defaults off. `author` is the identity every osq commit
 * carries and is required once writes are on. `worktreeRoot` names where linked
 * worktrees live, `defaultBranch` names the branch approval must start from,
 * and `prepare` runs before osq commits; all three keep their trimmed form.
 * The commit timeout lives with the other timeouts.
 */
export interface VcsConfig {
  readonly enabled: boolean;
  readonly author?: string;
  readonly worktreeRoot?: string;
  readonly defaultBranch?: string;
  readonly prepare?: string;
}

export const DEFAULT_VCS_CONFIG: VcsConfig = { enabled: false };

/** The branch used when neither origin nor `vcs.defaultBranch` names one. */
export const DEFAULT_BRANCH = 'main';

/** Where linked worktrees live when `vcs.worktreeRoot` is unset. */
export const DEFAULT_WORKTREE_ROOT = '~/.osq/worktrees';

/** Default bound in seconds for each commit osq makes when unset. */
export const DEFAULT_GIT_COMMIT_SECONDS = 120;

/** A name, a space, and a non-empty email in angle brackets. */
const AUTHOR_PATTERN = /^\S.*\s<[^<>]+>$/;

/**
 * Validate an optional `vcs` block over the defaults. Missing fields keep the
 * defaults; a non-boolean `enabled`, a malformed author, an author missing
 * while enabled, and a blank or non-string path or command are rejected.
 */
export function validateVcsConfig(vcs: unknown): VcsConfig {
  if (vcs === undefined) return DEFAULT_VCS_CONFIG;
  if (typeof vcs !== 'object' || vcs === null || Array.isArray(vcs)) {
    throw new Error('vcs configuration must be an object');
  }
  const record = vcs as Record<string, unknown>;
  const enabled = record.enabled === undefined ? DEFAULT_VCS_CONFIG.enabled : record.enabled;
  if (typeof enabled !== 'boolean') {
    throw new Error('vcs.enabled must be a boolean');
  }
  let author: string | undefined;
  if (record.author !== undefined) {
    if (typeof record.author !== 'string' || !AUTHOR_PATTERN.test(record.author)) {
      throw new Error('vcs.author must look like "Name <email>"');
    }
    author = record.author;
  }
  if (enabled && author === undefined) {
    throw new Error('vcs.author is required when vcs.enabled is true');
  }
  const worktreeRoot = trimmedField(record, 'worktreeRoot');
  const defaultBranch = trimmedField(record, 'defaultBranch');
  const prepare = trimmedField(record, 'prepare');
  return {
    enabled,
    ...(author !== undefined ? { author } : {}),
    ...(worktreeRoot !== undefined ? { worktreeRoot } : {}),
    ...(defaultBranch !== undefined ? { defaultBranch } : {}),
    ...(prepare !== undefined ? { prepare } : {}),
  };
}

/** A present field's trimmed value, rejecting blanks and non-strings. */
function trimmedField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`vcs.${field} must be a non-empty string if provided`);
  }
  return value.trim();
}
