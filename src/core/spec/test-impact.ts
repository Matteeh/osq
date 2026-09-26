import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveScope } from '../run/scope.js';
import { type ImportGraph, reachImporters, reachImports } from './import-graph.js';
import { type LintFinding, makeFinding } from './lint-findings.js';
import { listNamedPaths } from './verify-paths.js';

/**
 * The import-graph half of impact lint: a task that reaches a preexisting test
 * it may not modify, and a verify that names tests which reach nothing in the
 * task's scope. Both consume the shared graph and never affect validity.
 */

/** One task's resolved scope, as lint already computed it. */
export interface TestImpactTask {
  readonly taskNumber: string;
  readonly taskPath: string;
  readonly existingPaths: readonly string[];
  readonly testsModify: boolean;
  readonly verify: string;
}

/** Limits read from `limits.importGraphDepth` and `limits.maxListedImporters`. */
export interface FrozenTestLimits {
  readonly maxDepth: number;
  readonly maxListed: number;
}

/** Test files governed by the `tests.modify` gate; mirrors the `tests/**` default. */
function isTestPath(relativePath: string): boolean {
  return relativePath === 'tests' || relativePath.startsWith('tests/');
}

/** Every existing test a task in the change may modify through `tests.modify`. */
function modifiableTests(tasks: readonly TestImpactTask[]): Set<string> {
  const modifiable = new Set<string>();
  for (const task of tasks) {
    if (!task.testsModify) continue;
    for (const existing of task.existingPaths) {
      if (isTestPath(existing)) modifiable.add(existing);
    }
  }
  return modifiable;
}

/** The scoped file a reached test imports, or null when none intersects scope. */
function scopedTarget(
  graph: ImportGraph,
  test: string,
  scoped: ReadonlySet<string>,
): string | null {
  const reached = reachImports(graph, [test])
    .filter((file) => scoped.has(file))
    .sort();
  return reached[0] ?? null;
}

/** The one-sentence frozen-test warning, capped by `maxListed`. */
function formatFrozenTestWarning(
  taskNumber: string,
  entries: ReadonlyArray<{ readonly depth: number; readonly test: string; readonly file: string }>,
  maxListed: number,
): string {
  const listed = entries.slice(0, maxListed);
  const direct = entries.filter((entry) => entry.depth === 1).length;
  const list = listed.map((entry) => `${entry.test} (${entry.file})`).join(', ');
  const rest = entries.length - listed.length;
  const more = rest > 0 ? ` and ${rest} more` : '';
  return `Task ${taskNumber} scope is imported by ${entries.length} preexisting tests that no task may modify, ${direct} directly: ${list}${more}. Add each test the task will change to its scope with tests.modify: true`;
}

/** Warn once per task whose existing scope is reached by an unmodifiable test. */
export function frozenTestFindings(
  tasks: readonly TestImpactTask[],
  graph: ImportGraph,
  limits: FrozenTestLimits,
): LintFinding[] {
  if (graph.files.length === 0) return [];
  const modifiable = modifiableTests(tasks);
  const findings: LintFinding[] = [];

  for (const task of tasks) {
    if (task.existingPaths.length === 0) continue;
    const scoped = new Set(task.existingPaths);
    const reachedTests = reachImporters(graph, task.existingPaths, limits.maxDepth).filter(
      (entry) => isTestPath(entry.file) && !modifiable.has(entry.file),
    );
    if (reachedTests.length === 0) continue;

    const entries = reachedTests.map((entry) => ({
      depth: entry.depth,
      test: entry.file,
      file: scopedTarget(graph, entry.file, scoped) ?? task.existingPaths[0] ?? '',
    }));
    findings.push(
      makeFinding(
        'warning',
        { file: task.taskPath },
        formatFrozenTestWarning(task.taskNumber, entries, limits.maxListed),
      ),
    );
  }

  return findings;
}

/** A path operand without glob metacharacters. */
function isExactOperand(operand: string): boolean {
  return !/[*?]/.test(operand);
}

async function pathExists(target: string): Promise<boolean> {
  return fs
    .stat(target)
    .then(() => true)
    .catch(() => false);
}

/**
 * The existing test files a verify names, or null when any named test operand is
 * missing or an unmatched glob. An operand that names no test yields an empty
 * list.
 */
async function verifiedTestPaths(projectRoot: string, command: string): Promise<string[] | null> {
  const seen = new Set<string>();
  const tests: string[] = [];

  for (const named of listNamedPaths(command)) {
    if (!isTestPath(named) || seen.has(named)) continue;
    seen.add(named);

    if (isExactOperand(named)) {
      if (!(await pathExists(path.join(projectRoot, named)))) return null;
      tests.push(named);
      continue;
    }

    const matches = (await resolveScope(projectRoot, [named]))
      .filter((entry) => entry.absolutePath !== null && isTestPath(entry.relativePath))
      .map((entry) => entry.relativePath);
    if (matches.length === 0) return null;
    tests.push(...matches);
  }

  return tests;
}

/**
 * Warn once per task whose verify names only existing tests and none of them
 * reaches an existing file in the task's scope at any depth.
 */
export async function verifyWithoutScopeFindings(
  projectRoot: string,
  tasks: readonly TestImpactTask[],
  graph: ImportGraph,
): Promise<LintFinding[]> {
  const findings: LintFinding[] = [];
  const graphFiles = new Set(graph.files);

  for (const task of tasks) {
    const named = await verifiedTestPaths(projectRoot, task.verify);
    const tests = named?.filter((test) => graphFiles.has(test)) ?? [];
    if (tests.length === 0) continue;

    const scoped = new Set(task.existingPaths);
    const reachesScope = tests.some((test) =>
      reachImports(graph, [test]).some((file) => scoped.has(file)),
    );
    if (reachesScope) continue;

    findings.push(
      makeFinding(
        'warning',
        { file: task.taskPath },
        `Task ${task.taskNumber} verify runs ${tests.join(', ')} but none of them imports a file in the task's scope`,
      ),
    );
  }

  return findings;
}
