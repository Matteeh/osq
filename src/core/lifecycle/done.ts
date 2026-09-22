import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { findSpecFolder } from '../spec/approve.js';
import { parseTaskList } from '../spec/parser.js';
import { getChangesDir } from '../status/layout.js';

export interface DoneManualResult {
  readonly specId: string;
  readonly folderName: string;
  readonly folderPath: string;
  readonly taskNumber: string;
  readonly markerPath: string;
  readonly eventPath: string;
}

const CHECKLIST_LINE_REGEX = /^(\s*-\s+\[)([ xX])(\]\s*)((?:(\d+)[.)]\s+)?)(.*)$/;

/**
 * Tick `taskNumber`'s checkbox in `tasks.md`, supporting flat and grouped
 * (`## <n>.`) numbering. Pure: returns the input unchanged when nothing matched.
 */
function tickTaskCheckboxContent(content: string, taskNumber: string): string {
  const target = Number.parseInt(taskNumber, 10);
  if (Number.isNaN(target)) return content;
  const lines = content.split('\n');
  let sectionNumber: number | null = null;
  let changed = false;
  const updated = lines.map((line) => {
    const headingMatch = line.match(/^##\s+(\S.*?)\s*$/);
    if (headingMatch) {
      const numeric = headingMatch[1].match(/^(\d+)[.)]?(?:\s|$)/);
      sectionNumber = numeric ? Number.parseInt(numeric[1], 10) : null;
      return line;
    }
    const itemMatch = line.match(CHECKLIST_LINE_REGEX);
    if (!itemMatch) return line;
    const [, prefix, mark, close, numberedPrefix, itemNumber, rest] = itemMatch;
    const identifier = itemNumber ? Number.parseInt(itemNumber, 10) : sectionNumber;
    if (identifier !== target || mark.toLowerCase() === 'x') return line;
    changed = true;
    return `${prefix}x${close}${numberedPrefix}${rest}`;
  });
  return changed ? updated.join('\n') : content;
}

/** A task exists when `tasks/<n>.md` is present or `tasks.md` lists number `<n>`. */
async function taskExists(folderPath: string, taskNumber: string): Promise<boolean> {
  const taskFile = path.join(folderPath, 'tasks', `${taskNumber}.md`);
  if (
    await fs.stat(taskFile).then(
      () => true,
      () => false,
    )
  )
    return true;

  const tasksMd = await fs.readFile(path.join(folderPath, 'tasks.md'), 'utf8').catch(() => null);
  if (tasksMd === null) return false;
  const target = Number.parseInt(taskNumber, 10);
  return parseTaskList(tasksMd).some((item) => item.number === target);
}

/**
 * Append the typed `done_manual` lifecycle event. Written directly rather than
 * through the harness layer so `src/core` stays free of cross-tier imports.
 */
async function appendDoneManualEvent(
  folderPath: string,
  taskNumber: string,
  reason: string,
): Promise<string> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const eventPath = path.join(eventsDir, `${taskNumber}.jsonl`);
  const event = {
    type: 'done_manual',
    timestamp: new Date().toISOString(),
    data: { task: taskNumber, reason },
  };
  await fs.appendFile(eventPath, `${JSON.stringify(event)}\n`, 'utf8');
  return eventPath;
}

/**
 * Mark a task done by human decision. Writes `.run/done/<n>` carrying
 * `manual: true` and the justification, appends a `done_manual` event, and ticks
 * the task checkbox in `tasks.md`. This is the sole path for manual completion;
 * archive-time verification still runs the task's `verify` command.
 */
export async function markTaskDoneManual(
  projectRoot: string,
  specIdOrPrefix: string,
  taskNumber: string,
  reason: string,
  config: OsqConfig,
): Promise<DoneManualResult> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    throw new Error('a manual completion reason is required');
  }

  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const folderPath = await findSpecFolder(specsDir, specIdOrPrefix);
  const folderName = path.basename(folderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] ?? folderName;

  if (!(await taskExists(folderPath, taskNumber))) {
    throw new Error(`Task "${taskNumber}" was not found in ${folderName}`);
  }

  const doneDir = path.join(folderPath, '.run', 'done');
  await fs.mkdir(doneDir, { recursive: true });
  const markerPath = path.join(doneDir, taskNumber);
  const frontmatter = `---\nmanual: true\nreason: ${JSON.stringify(trimmedReason)}\n---\n`;
  await fs.writeFile(markerPath, `${frontmatter}${new Date().toISOString()}\n`, 'utf8');

  const eventPath = await appendDoneManualEvent(folderPath, taskNumber, trimmedReason);

  const tasksMdPath = path.join(folderPath, 'tasks.md');
  const tasksContent = await fs.readFile(tasksMdPath, 'utf8').catch(() => null);
  if (tasksContent !== null) {
    const updated = tickTaskCheckboxContent(tasksContent, taskNumber);
    if (updated !== tasksContent) await fs.writeFile(tasksMdPath, updated, 'utf8');
  }

  return { specId, folderName, folderPath, taskNumber, markerPath, eventPath };
}
