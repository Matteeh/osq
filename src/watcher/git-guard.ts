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

/** The per-task guard `runTask` opens before spawn and checks after exit. */
export interface GitGuard {
  check(): Promise<void>;
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

/** The sorted changed files that are outside the resolved scope and change folder. */
async function scopeViolations(
  options: GitGuardOptions,
  changedFiles: readonly string[],
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

async function checkGitGuard(
  vcs: Vcs,
  before: VcsSnapshot,
  options: GitGuardOptions,
): Promise<void> {
  let after: VcsSnapshot;
  let comparison: VcsComparison;
  try {
    after = await captureSnapshot(vcs, options.projectRoot);
    comparison = compareSnapshots(before, after);
  } catch (err) {
    warn(options, `git state not recorded: ${errorMessage(err)}`);
    return;
  }

  try {
    if (comparison.moved.length > 0) {
      await appendVcsViolation(options, before.values, after.values, comparison.moved);
    }
    const files = await scopeViolations(options, comparison.changedFiles);
    if (files.length > 0) {
      await appendScopeViolation(options, files);
    }
  } catch (err) {
    warn(options, `git state not recorded: ${errorMessage(err)}`);
  }
}

/**
 * Select through `selectVcs` and capture the git state before the agent spawns.
 * Returns null when `NoVcs` is selected or a git read fails; a failed read logs
 * a warning and records nothing.
 */
export async function beginGitGuard(options: GitGuardOptions): Promise<GitGuard | null> {
  try {
    const vcs = await selectVcs(options.projectRoot, options.config);
    if (vcs.kind !== 'git') return null;
    const before = await captureSnapshot(vcs, options.projectRoot);
    return { check: () => checkGitGuard(vcs, before, options) };
  } catch (err) {
    warn(options, `git checks off: ${errorMessage(err)}`);
    return null;
  }
}
