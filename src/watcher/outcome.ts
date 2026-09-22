import fs from 'node:fs/promises';
import path from 'node:path';
import { type Logger, resolveSymbol } from '../core/logger.js';
import { SCOPE_RESOLVER_VERSION } from '../core/scope.js';
import {
  type DeadEventData,
  type DoneEventData,
  type HarnessEvent,
  type RegressedEventData,
  appendHarnessEvent,
} from '../harness/types.js';
export type RunTaskFailureReason =
  | 'spec_conflict'
  | 'already_running'
  | 'no_result'
  | 'verify_red'
  | 'change_verify_red'
  | 'crashed'
  | 'timeout'
  | 'undeclared_test_change'
  | 'regressed';
export interface RunTaskResult {
  success: boolean;
  reason?: RunTaskFailureReason;
  error?: string;
}
/** Tick `taskNumber`'s checkbox, supporting flat and grouped (`## <n>.`) numbering. Pure. */
export function tickTaskCheckboxContent(content: string, taskNumber: string): string {
  const target = Number.parseInt(taskNumber, 10);
  if (Number.isNaN(target)) {
    return content;
  }
  const lines = content.split('\n');
  let sectionNumber: number | null = null;
  let changed = false;
  const updated = lines.map((line) => {
    // Any `## ` heading resets the section scope; only a numeric heading
    // associates unnumbered items with a task.
    const headingMatch = line.match(/^##\s+(\S.*?)\s*$/);
    if (headingMatch) {
      const numeric = headingMatch[1].match(/^(\d+)[.)]?(?:\s|$)/);
      sectionNumber = numeric ? Number.parseInt(numeric[1], 10) : null;
      return line;
    }
    const itemMatch = line.match(/^(\s*-\s+\[)([ xX])(\]\s*)((?:(\d+)[.)]\s+)?)(.*)$/);
    if (!itemMatch) {
      return line;
    }
    const [, prefix, mark, close, numberedPrefix, itemNumber, rest] = itemMatch;
    const identifier = itemNumber ? Number.parseInt(itemNumber, 10) : sectionNumber;
    if (identifier !== target || mark.toLowerCase() === 'x') {
      return line;
    }
    changed = true;
    return `${prefix}x${close}${numberedPrefix}${rest}`;
  });
  return changed ? updated.join('\n') : content;
}
export async function tickTaskCheckbox(specFolderPath: string, taskNumber: string): Promise<void> {
  const tasksMdPath = path.join(specFolderPath, 'tasks.md');
  let content = '';
  try {
    content = await fs.readFile(tasksMdPath, 'utf8');
  } catch {
    return;
  }
  const updated = tickTaskCheckboxContent(content, taskNumber);
  if (updated !== content) {
    await fs.writeFile(tasksMdPath, updated, 'utf8');
  }
}
export async function recordLifecycleEvent(
  specFolderPath: string,
  taskNumber: string,
  event: HarnessEvent,
  summary: string,
  logger?: Logger,
  level: 'info' | 'verbose' = 'info',
): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, event);
  if (level === 'verbose') {
    logger?.verbose(summary);
  } else {
    logger?.info(summary);
  }
}
export async function recordDeadEvent(
  specFolderPath: string,
  taskNumber: string,
  reason: RunTaskFailureReason,
): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'dead',
    timestamp: new Date().toISOString(),
    data: { task: taskNumber, reason } satisfies DeadEventData,
  });
}
export async function recordRegressedEvent(
  specFolderPath: string,
  target: string,
  data: RegressedEventData,
): Promise<void> {
  await appendHarnessEvent(specFolderPath, target, {
    type: 'regressed',
    timestamp: new Date().toISOString(),
    data: { task: target, ...data } satisfies RegressedEventData,
  });
}
export async function recordDoneEvent(specFolderPath: string, taskNumber: string): Promise<void> {
  await appendHarnessEvent(specFolderPath, taskNumber, {
    type: 'done',
    timestamp: new Date().toISOString(),
    data: { task: taskNumber } satisfies DoneEventData,
  });
}
export function formatReapedMarker(
  reason: 'crashed' | 'timeout',
  pid: number,
  startedAt: number,
  reapedAt: number = Date.now(),
): string {
  return [
    '---',
    `reason: ${reason}`,
    `pid: ${pid}`,
    `started_at: ${new Date(startedAt).toISOString()}`,
    `reaped_at: ${new Date(reapedAt).toISOString()}`,
    '---',
    `Task execution terminated by watcher reaper (${reason}).`,
    '',
  ].join('\n');
}
async function writeMarkerFile(
  runDir: string,
  kind: string,
  name: string,
  content: string,
): Promise<void> {
  const dir = path.join(runDir, kind);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), content, 'utf8');
}
export async function writeDeadMarker(
  runDir: string,
  taskNumber: string,
  content: string,
): Promise<void> {
  await writeMarkerFile(runDir, 'dead', `${taskNumber}.md`, content);
}
/** Write the `.run/regressed/<target>.md` marker, creating the directory when needed. */
export async function writeRegressedMarker(
  runDir: string,
  target: string,
  content: string,
): Promise<void> {
  await writeMarkerFile(runDir, 'regressed', `${target}.md`, content);
}
export interface DoneMarkerMetadata {
  scopeHash: string;
  buildStamp: string;
  exitCode: number;
  fileHashes?: Record<string, string | null>;
  /** Recorded deterministic resolver version; defaults to the current version. */
  scopeResolver?: number;
}
export async function writeDoneMarker(
  runDir: string,
  taskNumber: string,
  metadata?: DoneMarkerMetadata,
): Promise<void> {
  const doneDir = path.join(runDir, 'done');
  await fs.mkdir(doneDir, { recursive: true });
  const stamp = `${new Date().toISOString()}\n`;
  const frontmatter = metadata
    ? `---\nscope_resolver: ${metadata.scopeResolver ?? SCOPE_RESOLVER_VERSION}\nscope_hash: "${metadata.scopeHash}"\nbuild_stamp: "${metadata.buildStamp}"\nexit_code: ${metadata.exitCode}\nscope_files: ${JSON.stringify(metadata.fileHashes ?? {})}\n---\n`
    : '';
  await fs.writeFile(path.join(doneDir, taskNumber), `${frontmatter}${stamp}`, 'utf8');
}
/** Task-outcome line: verified, dead, or regressed with reason and elapsed seconds. */
export function formatTaskOutcomeLine(
  taskNumber: string,
  success: boolean,
  reason: RunTaskFailureReason | undefined,
  elapsedSeconds: number,
  symbols: boolean,
  extra?: string,
): string {
  if (success) {
    return `${resolveSymbol('✓', '[ok]', symbols)} task ${taskNumber} verified (elapsed: ${elapsedSeconds}s)`;
  }
  const detail = extra ? `, ${extra}` : '';
  if (reason === 'regressed') {
    return `${resolveSymbol('?', '[regressed]', symbols)} task ${taskNumber} regressed (reason: ${reason}${detail}, elapsed: ${elapsedSeconds}s)`;
  }
  return `${resolveSymbol('✗', '[dead]', symbols)} task ${taskNumber} dead (reason: ${reason}${detail}, elapsed: ${elapsedSeconds}s)`;
}
