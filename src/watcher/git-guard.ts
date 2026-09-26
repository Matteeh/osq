import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { resolveScope } from '../core/run/scope.js';
import { selectVcs } from '../core/vcs/select.js';
import {
  type VcsComparison,
  type VcsMovedField,
  type VcsSnapshot,
  type VcsStateValues,
  captureSnapshot,
  compareSnapshots,
} from '../core/vcs/snapshot.js';
import type { Vcs } from '../core/vcs/vcs.js';
import { appendHarnessEvent } from '../harness/types.js';

export interface GitGuardOptions {
  readonly projectRoot: string;
  readonly specFolderPath: string;
  readonly taskNumber: string;
  readonly scope: readonly string[];
  readonly config: OsqConfig;
  readonly logger?: Logger;
}

/** Why a guard check kills a task. */
export type GuardViolationReason = 'vcs_violation' | 'scope_violation';

/** What the guard returns when a worktree task must die: reason, dead marker, error. */
export interface GuardViolation {
  readonly reason: GuardViolationReason;
  readonly marker: string;
  readonly error: string;
}

/** The per-task guard `runTask` opens before spawn and checks after exit. */
export interface GitGuard {
  check(): Promise<GuardViolation | null>;
}

/** The recovery text for each moved field; osq only prints it, never runs git. */
const PUT_BACK: Record<VcsMovedField, string> = {
  head: 'git reset --soft <before>',
  branch: 'git switch <before>',
  index: 'git restore --staged <paths>',
  stash: 'git stash pop',
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function warn(options: GitGuardOptions, message: string): void {
  options.logger?.warn(message);
}

/** A warning naming what moved, how to put each back, and the human-edit caveat. */
export function formatVcsViolationWarning(moved: readonly VcsMovedField[]): string {
  const parts = moved.map((field) => `${field} moved (put it back with \`${PUT_BACK[field]}\`)`);
  return `git state changed during the task: ${parts.join('; ')}. A human using git in this checkout during the task causes the same result.`;
}

/** A file under `tests/` that is untracked now and was not listed before spawn. */
function isNewUntrackedTest(before: VcsSnapshot, after: VcsSnapshot, file: string): boolean {
  return (
    file.startsWith('tests/') && after.files.get(file)?.code === '??' && !before.files.has(file)
  );
}

/** The sorted changed files that are outside the resolved scope and change folder. */
async function scopeViolations(
  options: GitGuardOptions,
  changedFiles: readonly string[],
  before: VcsSnapshot,
  after: VcsSnapshot,
): Promise<string[]> {
  const changePrefix = path
    .relative(options.projectRoot, options.specFolderPath)
    .split(path.sep)
    .join('/');
  const resolved = await resolveScope(options.projectRoot, options.scope);
  const inScope = new Set(
    resolved.filter((entry) => entry.absolutePath !== null).map((entry) => entry.relativePath),
  );
  return changedFiles
    .filter((file) => !isNewUntrackedTest(before, after, file))
    .filter((file) => !inScope.has(file))
    .filter((file) => file !== changePrefix && !file.startsWith(`${changePrefix}/`))
    .sort();
}

async function appendVcsViolation(
  options: GitGuardOptions,
  before: VcsStateValues,
  after: VcsStateValues,
  moved: readonly VcsMovedField[],
): Promise<void> {
  await appendHarnessEvent(options.specFolderPath, options.taskNumber, {
    type: 'vcs_violation',
    timestamp: new Date().toISOString(),
    data: { moved, before, after },
  });
  warn(options, formatVcsViolationWarning(moved));
}

async function appendScopeViolation(
  options: GitGuardOptions,
  files: readonly string[],
): Promise<void> {
  await appendHarnessEvent(options.specFolderPath, options.taskNumber, {
    type: 'scope_violation',
    timestamp: new Date().toISOString(),
    data: { files },
  });
  warn(options, `files changed outside the task's scope: ${files.join(', ')}`);
}

/** The dead marker for a guard violation, with the reason in frontmatter. */
function deadMarker(reason: GuardViolationReason, body: string): string {
  return `---\nreason: ${reason}\n---\n${body}\n`;
}

async function checkGitGuard(
  vcs: Vcs,
  before: VcsSnapshot,
  options: GitGuardOptions,
  kill: boolean,
): Promise<GuardViolation | null> {
  let after: VcsSnapshot;
  let comparison: VcsComparison;
  try {
    after = await captureSnapshot(vcs, options.projectRoot);
    comparison = compareSnapshots(before, after);
  } catch (err) {
    warn(options, `git state not recorded: ${errorMessage(err)}`);
    return null;
  }

  let vcsWarning: string | null = null;
  let scopeFiles: string[] = [];
  try {
    if (comparison.moved.length > 0) {
      vcsWarning = formatVcsViolationWarning(comparison.moved);
      await appendVcsViolation(options, before.values, after.values, comparison.moved);
    }
    scopeFiles = await scopeViolations(options, comparison.changedFiles, before, after);
    if (scopeFiles.length > 0) {
      await appendScopeViolation(options, scopeFiles);
    }
  } catch (err) {
    warn(options, `git state not recorded: ${errorMessage(err)}`);
    return null;
  }

  if (!kill) return null;
  if (vcsWarning !== null) {
    return {
      reason: 'vcs_violation',
      marker: deadMarker('vcs_violation', vcsWarning),
      error: vcsWarning,
    };
  }
  if (scopeFiles.length > 0) {
    return {
      reason: 'scope_violation',
      marker: deadMarker('scope_violation', scopeFiles.join('\n')),
      error: `files changed outside the task's scope: ${scopeFiles.join(', ')}`,
    };
  }
  return null;
}

/**
 * Select through `selectVcs` and capture the git state before the agent spawns.
 * Returns null when `NoVcs` is selected or a git read fails; a failed read logs
 * a warning and records nothing. `check` returns the violation to kill with only
 * when `vcs.enabled` and HEAD was on an `osq/` branch before spawn.
 */
export async function beginGitGuard(options: GitGuardOptions): Promise<GitGuard | null> {
  try {
    const vcs = await selectVcs(options.projectRoot, options.config);
    if (vcs.kind !== 'git') return null;
    const before = await captureSnapshot(vcs, options.projectRoot);
    const kill =
      options.config.vcs?.enabled === true && (before.values.branch?.startsWith('osq/') ?? false);
    return { check: () => checkGitGuard(vcs, before, options, kill) };
  } catch (err) {
    warn(options, `git checks off: ${errorMessage(err)}`);
    return null;
  }
}
