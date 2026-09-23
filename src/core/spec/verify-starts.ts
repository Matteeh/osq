import { scopeCoversPath } from '../run/scope.js';
import type { VerifyStarts } from './parser.js';
import { missingNamedPaths } from './verify-paths.js';

/**
 * Shared rule for a verify that names a path the task itself is supposed to
 * create. Lint and the approval digest both consume it so their diagnostics
 * agree.
 */

/** One task as the rule sees it: identity, verify, declared start, and scope. */
export interface VerifyStartTask {
  readonly taskNumber: string;
  readonly verify: string;
  readonly verifyStarts: VerifyStarts;
  readonly scope: readonly string[];
}

/** A task that declares `green` or `any` while naming a path it creates. */
export interface VerifyStartContradiction {
  readonly taskNumber: string;
  readonly path: string;
  readonly start: VerifyStarts;
}

/** A named missing path no task's scope up to and including this one covers. */
export interface VerifyStartUncreatable {
  readonly taskNumber: string;
  readonly path: string;
}

export interface VerifyStartReport {
  readonly contradictions: readonly VerifyStartContradiction[];
  readonly uncreatable: readonly VerifyStartUncreatable[];
}

/** Glob metacharacters that mark a named path as a pattern. */
const GLOB_METACHARACTER_REGEX = /[*?]/;

/** Normalize a raw scope entry or named path to a comparable POSIX form. */
function normalizeEntry(value: string): string {
  return value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '');
}

/**
 * True when a declared scope covers one named path. An exact named path is
 * covered by an exact or pattern scope entry; a glob named path is covered only
 * by an identical scope entry, because another pattern is not evidence that this
 * verify's own test file exists.
 */
export function scopeCoversNamedPath(scope: readonly string[], namedPath: string): boolean {
  if (GLOB_METACHARACTER_REGEX.test(namedPath)) {
    const normalizedPath = normalizeEntry(namedPath);
    return scope.some((entry) => normalizeEntry(entry) === normalizedPath);
  }
  return scopeCoversPath(scope, namedPath);
}

/** True when any of the given scopes covers one named path. */
export function namedPathCoveredByScopes(
  namedPath: string,
  scopes: readonly (readonly string[])[],
): boolean {
  return scopes.some((scope) => scopeCoversNamedPath(scope, namedPath));
}

/**
 * Analyze one change's tasks in numeric order. For each missing named path not
 * covered by an earlier task's scope, a task that declares `green` or `any`
 * while its own scope covers the path contradicts itself; a path no scope up to
 * this task covers is one no task in the change can create.
 */
export async function analyzeVerifyStarts(
  projectRoot: string,
  tasks: readonly VerifyStartTask[],
): Promise<VerifyStartReport> {
  const contradictions: VerifyStartContradiction[] = [];
  const uncreatable: VerifyStartUncreatable[] = [];
  const earlierScopes: string[][] = [];

  for (const task of tasks) {
    const missing = await missingNamedPaths(projectRoot, task.verify);

    for (const namedPath of missing) {
      if (namedPathCoveredByScopes(namedPath, earlierScopes)) {
        continue;
      }

      const ownCovered = scopeCoversNamedPath(task.scope, namedPath);
      if (ownCovered && task.verifyStarts !== 'red') {
        contradictions.push({
          taskNumber: task.taskNumber,
          path: namedPath,
          start: task.verifyStarts,
        });
      } else if (!ownCovered) {
        uncreatable.push({ taskNumber: task.taskNumber, path: namedPath });
      }
    }

    earlierScopes.push([...task.scope]);
  }

  return { contradictions, uncreatable };
}
