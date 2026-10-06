import fs from 'node:fs/promises';
import path from 'node:path';
import { refreshRecertifiedDoneMarker } from '../lifecycle/recertify.js';
import {
  type DoneMarkerInfo,
  type ScopeHashResult,
  computeTaskScopeHash,
  findDifferingPaths,
} from '../run/scope-hash.js';
import type { Vcs } from './vcs.js';

/** One done task step 1 kept for recertification, with its verify command. */
export interface SyncRecertifyTask {
  readonly task: string;
  readonly command: string;
  readonly scope: readonly string[];
  readonly recorded: DoneMarkerInfo;
}

/** The files the recertification overwrote, kept so a later stop can restore them. */
export interface SyncRecertifyState {
  readonly backups: { path: string; before: string | null }[];
}

/** A new, empty recertification backup state. */
export function createSyncRecertifyState(): SyncRecertifyState {
  return { backups: [] };
}

/** Remember one file's contents once, before the sync overwrites it. */
async function keep(state: SyncRecertifyState, file: string): Promise<void> {
  if (state.backups.some((entry) => entry.path === file)) return;
  state.backups.push({ path: file, before: await fs.readFile(file, 'utf8').catch(() => null) });
}

/** Put every file the recertification overwrote back as it was. */
export async function restoreSyncRecertified(state: SyncRecertifyState): Promise<void> {
  for (const { path: file, before } of state.backups) {
    if (before === null) {
      await fs.rm(file, { force: true });
      continue;
    }
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, before, 'utf8');
  }
}

/** One `recertification` event line for a merged-tree difference. */
function eventLine(
  task: SyncRecertifyTask,
  current: ScopeHashResult,
  differing: ReturnType<typeof findDifferingPaths>,
): string {
  const event = {
    type: 'recertification',
    timestamp: new Date().toISOString(),
    data: {
      task: task.task,
      outcome: 'passed',
      differingPaths: differing.map((entry) => entry.display),
      attribution: differing.map((entry) => ({ path: entry.display, attribution: 'sync' })),
      command: task.command,
      exitCode: 0,
      timedOut: false,
      recordedHash: task.recorded.scopeHash,
      currentHash: current.hash,
      automatic: true,
    },
  };
  return `${JSON.stringify(event)}\n`;
}

/** A worktree-root-relative POSIX path for staging. */
function staged(worktreeRoot: string, file: string): string {
  return path.relative(worktreeRoot, file).split(path.sep).join('/');
}

/**
 * Steps 2 and 3 of "Sync recertifies done tasks": for each kept task whose
 * merged-tree scope hash differs from its done record, refresh the marker,
 * append the automatic `recertification` event, and stage both. A file's
 * contents are kept before its first write so a later stop can restore them.
 */
export async function recertifySyncTasks(
  worktreeRoot: string,
  changeFolderPath: string,
  tasks: readonly SyncRecertifyTask[],
  vcs: Vcs,
  state: SyncRecertifyState,
): Promise<void> {
  const runDir = path.join(changeFolderPath, '.run');
  for (const task of tasks) {
    const current = await computeTaskScopeHash(worktreeRoot, [...task.scope]);
    if (current.hash === task.recorded.scopeHash) continue;
    const differing = findDifferingPaths(task.recorded.scopeFiles, current.fileHashes);
    const done = path.join(runDir, 'done', task.task);
    const events = path.join(runDir, 'events', `${task.task}.jsonl`);
    await keep(state, done);
    await keep(state, events);
    await refreshRecertifiedDoneMarker(runDir, task.task, task.recorded.scopeHash, current);
    await fs.mkdir(path.dirname(events), { recursive: true });
    await fs.appendFile(events, eventLine(task, current, differing), 'utf8');
    await vcs.stage([staged(worktreeRoot, done), staged(worktreeRoot, events)]);
  }
}
