import fs from 'node:fs/promises';
import path from 'node:path';
import { missingEntryPaths } from '../core/run/entry-paths.js';
import { type TaskData, parseTaskMd } from '../core/spec/parser.js';
import type { RunTaskResult } from './outcome.js';
import type { FailFn } from './task-verify.js';

/** The task file read into data, or the failure that ended the task. */
export type ApprovedTaskFile =
  | { readonly ok: true; readonly taskData: TaskData }
  | { readonly ok: false; readonly result: RunTaskResult };

/** Dead marker for a task whose `entry` names files the tree does not hold. */
export function formatEntryMissingMarker(missing: readonly string[], specId: string): string {
  return [
    '---',
    'reason: entry_missing',
    '---',
    "The task's entry names files that do not exist:",
    ...missing.map((entry) => `- ${entry}`),
    `Revise the plan with osq plan ${specId}, then approve it again.`,
    '',
  ].join('\n');
}

/**
 * Read and parse the approved task file, then check its `entry` against the
 * tree the task runs in. A missing task file still dies `crashed` with today's
 * marker; a missing entry dies `entry_missing` before any lock, measure,
 * `started` event, baseline or verify.
 *
 * @scenario watcher-and-harness: Entry names a removed file
 * @scenario watcher-and-harness: Steered task runs
 * @adr 006
 */
export async function readApprovedTaskFile(
  projectRoot: string,
  specFolderPath: string,
  taskNumber: string,
  fail: FailFn,
): Promise<ApprovedTaskFile> {
  const taskPath = path.join(specFolderPath, 'tasks', `${taskNumber}.md`);
  let taskContent = '';
  try {
    taskContent = await fs.readFile(taskPath, 'utf8');
  } catch {
    const marker = `---\nreason: crashed\n---\nTask file not found: ${taskPath}\n`;
    return { ok: false, result: await fail('crashed', marker, 'Task file not found') };
  }
  const taskData = parseTaskMd(taskContent);
  const missing = await missingEntryPaths(projectRoot, taskData);
  if (missing.length === 0) return { ok: true, taskData };
  const folderName = path.basename(specFolderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;
  const marker = formatEntryMissingMarker(missing, specId);
  const error = `Missing entry files: ${missing.join(', ')}`;
  return { ok: false, result: await fail('entry_missing', marker, error) };
}
