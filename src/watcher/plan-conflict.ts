import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { parseResultSections } from '../core/report/result-sections.js';
import { readFailingTestFiles } from '../core/run/failing-tests.js';
import { resolveScope } from '../core/run/scope.js';
import type { VerificationResult } from '../core/run/verification.js';
import { excerptVerifyOutput } from '../core/run/verify-excerpt.js';
import { parseTaskMd } from '../core/spec/parser.js';
import { compareNumericPrefix } from '../core/status/state.js';
import type { ChangeVerifyRerunContext } from './change-verify-rerun.js';
import type { VerificationGateResult } from './verify.js';

/** One failing test file and the earlier done task of the change that owns it. */
export interface PlanConflict {
  readonly test: string;
  readonly task: string;
}

/** The project-relative paths one done task owns: its resolved scope plus Touched line. */
async function ownedPaths(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
): Promise<Set<string>> {
  const owned = new Set<string>();
  const taskContent = await fs
    .readFile(path.join(specFolderPath, 'tasks', `${taskNumber}.md`), 'utf8')
    .catch(() => null);
  if (taskContent !== null) {
    for (const entry of await resolveScope(projectRoot, parseTaskMd(taskContent).scope)) {
      if (entry.absolutePath !== null) owned.add(entry.relativePath);
    }
  }
  const resultContent = await fs
    .readFile(path.join(specFolderPath, '.run', 'results', `${taskNumber}.md`), 'utf8')
    .catch(() => null);
  if (resultContent !== null) {
    const touched = parseResultSections(resultContent).touched;
    if (touched !== null) {
      for (const entry of touched.split(',')) {
        const trimmed = entry.trim();
        if (trimmed !== '') owned.add(trimmed);
      }
    }
  }
  return owned;
}

/**
 * The failing tests of the last change-verify run when they are a plan
 * conflict: the run did not time out, its output names at least one failing
 * test file, and every such file is outside the current task's resolved scope
 * and owned by another task of the same change with a done marker under
 * `.run/done/`. Returns one entry per failing test, sorted, each with the
 * lowest-numbered owning done task, or null when any failing test misses.
 *
 * @scenario watcher-and-harness: Failing tests owned by an earlier task
 * @scenario watcher-and-harness: Plan conflict marker
 * @adr 006
 */
export async function findPlanConflict(
  result: Pick<VerificationResult, 'timedOut' | 'output'>,
  projectRoot: string,
  specFolderPath: string,
  context: ChangeVerifyRerunContext,
): Promise<PlanConflict[] | null> {
  if (result.timedOut) return null;
  const tests = readFailingTestFiles(result.output, projectRoot);
  if (tests === null) return null;

  const scoped = new Set(
    (await resolveScope(projectRoot, context.scope))
      .filter((entry) => entry.absolutePath !== null)
      .map((entry) => entry.relativePath),
  );

  const doneDir = path.join(specFolderPath, '.run', 'done');
  const doneTasks = (await fs.readdir(doneDir).catch(() => [] as string[]))
    .filter((entry) => /^\d+$/.test(entry))
    .sort(compareNumericPrefix);

  const owners = new Map<string, string[]>();
  for (const taskNumber of doneTasks) {
    if (taskNumber === context.taskNumber) continue;
    for (const file of await ownedPaths(projectRoot, specFolderPath, taskNumber)) {
      const contenders = owners.get(file);
      if (contenders === undefined) owners.set(file, [taskNumber]);
      else contenders.push(taskNumber);
    }
  }

  const conflicts: PlanConflict[] = [];
  for (const test of tests) {
    if (scoped.has(test)) return null;
    const contenders = owners.get(test);
    if (contenders === undefined) return null;
    conflicts.push({ test, task: [...contenders].sort(compareNumericPrefix)[0] });
  }
  return conflicts.sort((a, b) => (a.test < b.test ? -1 : a.test > b.test ? 1 : 0));
}

/**
 * The dead marker of a plan conflict: `reason: blocked`, the change verify
 * command and exit code, one `- ` line per failing test with its owner in
 * sorted order, the `osq plan <id>` line, and the verify excerpt built as
 * `formatChangeVerifyMarker` builds it.
 *
 * @scenario watcher-and-harness: Plan conflict marker
 * @adr 006
 */
export function formatPlanConflictMarker(
  command: string,
  config: OsqConfig,
  specFolderPath: string,
  result: Pick<VerificationGateResult, 'exitCode' | 'output' | 'log'>,
  conflicts: readonly PlanConflict[],
): string {
  const excerpt = excerptVerifyOutput(
    result.output,
    result.log ?? 'the verify_ran event in .run/events/change.jsonl',
    config.limits,
  );
  const folderName = path.basename(specFolderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  return [
    '---',
    'reason: blocked',
    `command: ${JSON.stringify(command)}`,
    `exit_code: ${result.exitCode}`,
    '---',
    'Change-level verification failed only on tests that earlier done tasks own, so this task conflicts with the plan:',
    ...conflicts.map((entry) => `- ${entry.test} (task ${entry.task})`),
    `Revise the plan with osq plan ${specId}, then approve it again.`,
    excerpt,
    '',
  ].join('\n');
}
