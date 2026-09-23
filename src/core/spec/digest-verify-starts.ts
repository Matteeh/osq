import type { ApprovalFlagTask } from './digest-flags.js';
import type { ApprovalFlag } from './digest.js';
import { type VerifyStartTask, analyzeVerifyStarts } from './verify-starts.js';

/**
 * Turns each verify start contradiction found by the shared rule in
 * `verify-starts.ts` into one approval flag. Lint and the digest consume the
 * same rule so their diagnostics agree.
 */

function compareTaskNumbers(a: string, b: string): number {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (!Number.isNaN(numA) && !Number.isNaN(numB) && numA !== numB) return numA - numB;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** One flag per task that declares `green` or `any` while creating its own named path. */
export async function verifyStartsConflictFlags(
  projectRoot: string,
  tasks: readonly ApprovalFlagTask[],
): Promise<ApprovalFlag[]> {
  const ruleTasks: VerifyStartTask[] = tasks.map((task) => ({
    taskNumber: task.number,
    verify: task.verify,
    verifyStarts: task.verifyStarts,
    scope: task.scope,
  }));
  const report = await analyzeVerifyStarts(projectRoot, ruleTasks);
  return [...report.contradictions]
    .sort((a, b) => compareTaskNumbers(a.taskNumber, b.taskNumber) || (a.path < b.path ? -1 : 1))
    .map((contradiction) => ({
      id: 'verify_starts_conflict' as const,
      label: `verify starts conflict in task ${contradiction.taskNumber}`,
      excerpt: `${contradiction.path} is named by the verify but created by this task, which declares verify_starts: ${contradiction.start}`,
    }));
}
