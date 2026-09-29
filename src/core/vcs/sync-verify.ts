import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { runVerificationCommand } from '../run/verification.js';
import { parseFrontmatter } from '../spec/parser.js';
import type { LocatedChange } from '../status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import { SyncStop } from './sync-stop.js';
import { worktreeBranch } from './worktree.js';

/** One done task whose verify the sync re-runs. */
export interface SyncVerifyTask {
  readonly task: string;
  readonly verify: string;
}

/** Everything step 5 of a sync needs. */
export interface SyncVerifyOptions {
  readonly worktreeRoot: string;
  readonly change: LocatedChange;
  readonly config: OsqConfig;
  readonly defaultBranch: string;
  readonly archived: boolean;
  readonly verifyCommand: string;
  readonly commits: number;
  readonly mergeStart: number;
  readonly tasks: readonly SyncVerifyTask[];
}

/** The last `limit` non-blank lines of command output. */
function outputTail(output: string, limit: number): string {
  const lines = output.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - limit)).join('\n');
}

/** Whether a done marker carries the watcher's `manual: true` frontmatter. */
async function isManual(folderPath: string, task: string): Promise<boolean> {
  const marker = await fs
    .readFile(path.join(folderPath, '.run', 'done', task), 'utf8')
    .catch(() => '');
  return parseFrontmatter(marker).data.manual === true;
}

/** Every done, non-manual task with a verify, in task order. */
export async function syncVerifyTasks(change: LocatedChange): Promise<SyncVerifyTask[]> {
  const state = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
  const tasks: SyncVerifyTask[] = [];
  for (const task of state.tasks) {
    if (task.status !== 'done' || task.verify === '') continue;
    if (await isManual(change.folderPath, task.taskNumber)) continue;
    tasks.push({ task: task.taskNumber, verify: task.verify });
  }
  return tasks;
}

/** Append one event to the change folder's change stream. */
async function appendEvent(
  changeFolderPath: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const eventsDir = path.join(changeFolderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = { type, timestamp: new Date().toISOString(), data };
  await fs.appendFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

/** Run one verify command, stopping on failure and recording a pass. */
async function runOne(
  options: SyncVerifyOptions,
  command: string,
  changeFolder: string | null,
  task: string | undefined,
): Promise<void> {
  const result = await runVerificationCommand(
    options.worktreeRoot,
    command,
    options.config.timeouts.verifyTimeoutSeconds,
    changeFolder,
  );
  if (result.exitCode !== 0) {
    const subject =
      task === undefined
        ? `verify failed on ${worktreeBranch(options.change.folderName)}`
        : `verify of task ${task} failed on ${worktreeBranch(options.change.folderName)}`;
    throw new SyncStop(
      'sync_failed',
      `${options.change.folderName}: ${subject} merged with ${options.defaultBranch}:\n${outputTail(result.output, options.config.limits.cardOutputLines)}`,
    );
  }
  await appendEvent(options.change.folderPath, 'verify_ran', {
    command,
    exitCode: result.exitCode,
    duration: Math.round(result.duration * 1000),
    ...(result.output.trim() ? { output: result.output } : {}),
    ...(task !== undefined ? { task } : {}),
  });
}

/**
 * Step 5 of the sync: run the proposal's verify for an archived change, or
 * the done tasks' verifies for an active one, record each pass, then append
 * the `synced` event. Every failure is a `SyncStop` with reason `sync_failed`.
 */
export async function runSyncVerify(options: SyncVerifyOptions): Promise<void> {
  if (options.archived) {
    if (options.verifyCommand !== '') {
      await runOne(options, options.verifyCommand, null, undefined);
    }
  } else {
    for (const task of options.tasks) {
      await runOne(options, task.verify, options.change.folderPath, task.task);
    }
  }
  await appendEvent(options.change.folderPath, 'synced', {
    defaultBranch: options.defaultBranch,
    commits: options.commits,
    duration: Date.now() - options.mergeStart,
  });
}
