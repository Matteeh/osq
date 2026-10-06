import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { type DoneMarkerInfo, computeTaskScopeHash, readDoneMarker } from '../run/scope-hash.js';
import { runVerificationCommand } from '../run/verification.js';
import { tailVerifyOutput } from '../run/verify-excerpt.js';
import { writeVerifyLog } from '../run/verify-log.js';
import { readCheckCommand } from '../spec/human-steps.js';
import { parseFrontmatter, parseSpecMdFromFolder, parseTaskMd } from '../spec/parser.js';
import type { LocatedChange } from '../status/change-locations.js';
import { deriveSpecState, readChangeFolder } from '../status/state.js';
import {
  type SyncRecertifyState,
  type SyncRecertifyTask,
  recertifySyncTasks,
} from './sync-recertify.js';
import { SyncStop } from './sync-stop.js';
import type { Vcs } from './vcs.js';
import { worktreeBranch } from './worktree.js';

/** One done task whose verify the sync re-runs, with step 1's recertification record. */
export interface SyncVerifyTask {
  readonly task: string;
  readonly verify: string;
  readonly scope?: readonly string[];
  readonly recorded?: DoneMarkerInfo;
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
  readonly skipVerify: boolean;
  readonly vcs: Vcs;
  readonly recertify: SyncRecertifyState;
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

/** The scope a task file declares, for step 1's pre-merge hash. */
async function taskScope(changeFolderPath: string, taskNumber: string): Promise<string[]> {
  const content = await fs
    .readFile(path.join(changeFolderPath, 'tasks', `${taskNumber}.md`), 'utf8')
    .catch(() => '');
  return parseTaskMd(content).scope;
}

/**
 * Every done, non-manual task with a verify, in task order. For each whose
 * done marker reads and whose pre-merge scope hash equals the marker's, step 1
 * also records the scope and marker so a later merge can recertify it.
 */
export async function syncVerifyTasks(change: LocatedChange): Promise<SyncVerifyTask[]> {
  const state = deriveSpecState(await readChangeFolder(change.tree.root, change.folderPath));
  const runDir = path.join(change.folderPath, '.run');
  const tasks: SyncVerifyTask[] = [];
  for (const task of state.tasks) {
    if (task.status !== 'done' || task.verify === '') continue;
    if (await isManual(change.folderPath, task.taskNumber)) continue;
    const base = { task: task.taskNumber, verify: task.verify };
    const recorded = await readDoneMarker(runDir, task.taskNumber);
    if (recorded === null) {
      tasks.push(base);
      continue;
    }
    const scope = await taskScope(change.folderPath, task.taskNumber);
    const current = await computeTaskScopeHash(change.tree.root, scope);
    tasks.push(current.hash === recorded.scopeHash ? { ...base, scope, recorded } : base);
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
  kind: 'verify' | 'check' = 'verify',
): Promise<void> {
  const result = await runVerificationCommand(
    options.worktreeRoot,
    command,
    options.config.timeouts.verifyTimeoutSeconds,
    changeFolder,
    { config: options.config },
  );
  if (result.exitCode !== 0) {
    const subject =
      kind === 'check'
        ? `check failed on ${worktreeBranch(options.change.folderName)}`
        : task === undefined
          ? `verify failed on ${worktreeBranch(options.change.folderName)}`
          : `verify of task ${task} failed on ${worktreeBranch(options.change.folderName)}`;
    throw new SyncStop(
      'sync_verify_red',
      `${options.change.folderName}: ${subject} merged with ${options.defaultBranch}:\n${outputTail(result.output, options.config.limits.cardOutputLines)}`,
    );
  }
  const log = await writeVerifyLog(options.change.folderPath, 'change', result.output);
  const tail = tailVerifyOutput(result.output, options.config.limits);
  await appendEvent(options.change.folderPath, 'verify_ran', {
    command,
    exitCode: result.exitCode,
    duration: Math.round(result.duration * 1000),
    log,
    ...(tail ? { output: tail } : {}),
    ...(task !== undefined ? { task } : {}),
  });
}

/** The proposal's `check` command in the change folder, else null. */
async function readCheck(changeFolderPath: string): Promise<string | null> {
  const proposal = await parseSpecMdFromFolder(changeFolderPath).catch(() => null);
  if (!proposal) return null;
  return readCheckCommand(parseFrontmatter(proposal.raw).data);
}

/**
 * Step 5 of the sync: run the proposal's verify for an archived change, or
 * the done tasks' verifies for an active one, record each pass, then append
 * the `synced` event. Every failure is a `SyncStop` with reason
 * `sync_verify_red`. With `skipVerify` set no command runs at all.
 */
/** The kept step-1 tasks, as the recertification's own inputs. */
function recertifyInputs(tasks: readonly SyncVerifyTask[]): SyncRecertifyTask[] {
  const inputs: SyncRecertifyTask[] = [];
  for (const task of tasks) {
    if (task.scope === undefined || task.recorded === undefined) continue;
    inputs.push({
      task: task.task,
      command: task.verify,
      scope: task.scope,
      recorded: task.recorded,
    });
  }
  return inputs;
}

export async function runSyncVerify(options: SyncVerifyOptions): Promise<void> {
  if (!options.skipVerify) {
    if (options.archived) {
      if (options.verifyCommand !== '') {
        await runOne(options, options.verifyCommand, null, undefined);
      }
      const check = await readCheck(options.change.folderPath);
      if (check !== null) {
        await runOne(options, check, null, undefined, 'check');
      }
    } else {
      for (const task of options.tasks) {
        await runOne(options, task.verify, options.change.folderPath, task.task);
      }
      await recertifySyncTasks(
        options.worktreeRoot,
        options.change.folderPath,
        recertifyInputs(options.tasks),
        options.vcs,
        options.recertify,
      );
    }
  }
  await appendEvent(options.change.folderPath, 'synced', {
    defaultBranch: options.defaultBranch,
    commits: options.commits,
    duration: Date.now() - options.mergeStart,
  });
}
