import fs from 'node:fs/promises';
import path from 'node:path';
import { parseResultSections } from '../core/report/result-sections.js';
import type { RunTaskResult } from './outcome.js';
import type { FailFn } from './task-verify.js';

/** Dead marker for a blocked task: the reason in frontmatter, then the need. */
export function formatBlockedDeadMarker(need: string): string {
  return ['---', 'reason: blocked', '---', need, ''].join('\n');
}

/**
 * When the task's result file states a real `## Blocked` section, fail the task
 * with reason `blocked` and the stated need in the dead marker body. A missing
 * result file, or a section that is empty or says only `None`, leaves the task
 * to the checks that follow.
 */
export async function checkBlocked(
  specFolderPath: string,
  taskNumber: string,
  fail: FailFn,
): Promise<RunTaskResult | null> {
  const resultPath = path.join(specFolderPath, '.run', 'results', `${taskNumber}.md`);
  const content = await fs.readFile(resultPath, 'utf8').catch(() => null);
  if (content === null) return null;
  const { blocked } = parseResultSections(content);
  if (blocked === null) return null;
  return fail('blocked', formatBlockedDeadMarker(blocked), `Task blocked: ${blocked}`);
}
