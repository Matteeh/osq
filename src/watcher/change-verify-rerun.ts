import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { readFailingTestFiles } from '../core/run/failing-tests.js';
import { resolveScope } from '../core/run/scope.js';
import { isGatedTestPath } from '../core/run/test-gate.js';
import type { VerificationResult } from '../core/run/verification.js';
import { buildImportGraph, reachImports } from '../core/spec/import-graph.js';

/**
 * The task-boundary facts the change-verify rerun decision needs: the task's
 * number (the stream its `change_verify_rerun` events go to), its declared
 * scope, and the preexisting `tests/` content hash snapshot the runner took
 * before the agent spawned.
 */
export interface ChangeVerifyRerunContext {
  readonly taskNumber: string;
  readonly scope: readonly string[];
  readonly testSnapshot: ReadonlyMap<string, string>;
}

/** The current sha256 content hash of a project-relative test file, or null. */
async function currentTestHash(projectRoot: string, relative: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(projectRoot, relative));
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * The failing test files of `result` when the failures are unrelated to the
 * task, else null. They are unrelated only when the run did not time out, its
 * output names at least one failing test file, and every named file is a
 * preexisting unchanged test under `tests/` outside the task's resolved scope
 * that imports, at any depth, no existing file in that scope.
 */
export async function findUnrelatedFailingTests(
  result: Pick<VerificationResult, 'timedOut' | 'output'>,
  projectRoot: string,
  context: ChangeVerifyRerunContext,
  config: OsqConfig,
): Promise<string[] | null> {
  if (result.timedOut) return null;
  const tests = readFailingTestFiles(result.output, projectRoot);
  if (tests === null) return null;

  const scoped = new Set(
    (await resolveScope(projectRoot, context.scope))
      .filter((entry) => entry.absolutePath !== null)
      .map((entry) => entry.relativePath),
  );

  for (const test of tests) {
    if (!isGatedTestPath(test)) return null;
    const snapshotHash = context.testSnapshot.get(test);
    if (snapshotHash === undefined) return null;
    if ((await currentTestHash(projectRoot, test)) !== snapshotHash) return null;
    if (scoped.has(test)) return null;
  }

  const graph = await buildImportGraph(projectRoot, { skip: [config.paths.openspecRoot] });
  const reached = reachImports(graph, tests);
  return reached.some((file) => scoped.has(file)) ? null : tests;
}
