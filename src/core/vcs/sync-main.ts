import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { runVerificationCommand } from '../run/verification.js';
import { runPrepare } from '../spec/approve-worktree.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import type { LocatedChange } from '../status/change-locations.js';
import { selectVcs } from './select.js';
import {
  assertRequirementsUnchanged,
  listDeltaCapabilities,
  livingSpecPath,
  rebuildLivingSpecs,
} from './sync-specs.js';
import type { Vcs, VcsMergeResult } from './vcs.js';
import { worktreeBranch } from './worktree.js';

/** The sync commit's subject and change trailer. */
function syncMessage(folderName: string, defaultBranch: string): string {
  const id = folderName.split('-')[0] ?? folderName;
  return `osq: ${id} sync ${defaultBranch}\n\nOsq-Change: ${folderName}`;
}

/** The last `limit` non-blank lines of command output. */
function outputTail(output: string, limit: number): string {
  const lines = output.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop();
  return lines.slice(Math.max(0, lines.length - limit)).join('\n');
}

/** The `.run/base` commit, or null when the marker is absent or blank. */
async function readBaseCommit(folderPath: string): Promise<string | null> {
  const content = await fs.readFile(path.join(folderPath, '.run', 'base'), 'utf8').catch(() => '');
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Abort an in-progress merge, then stop with `error`'s message. */
async function abortMerge(vcs: Vcs, error: unknown): Promise<never> {
  await vcs.mergeAbort().catch(() => undefined);
  throw error instanceof Error ? error : new Error(String(error));
}

/** The stop raised when a code path conflicts with the default branch. */
function conflictStop(
  change: LocatedChange,
  defaultBranch: string,
  blocked: readonly string[],
): Error {
  const worktree = change.tree.root;
  const id = change.folderName.split('-')[0] ?? change.folderName;
  return new Error(
    `${change.folderName}: ${blocked.join(', ')} conflict with ${defaultBranch}; merge it into ${worktreeBranch(change.folderName)} by hand in ${worktree}, then run osq land ${id} again`,
  );
}

/** The stop raised when the merged tree fails the proposal's verify. */
function verifyStop(
  change: LocatedChange,
  defaultBranch: string,
  output: string,
  config: OsqConfig,
): Error {
  return new Error(
    `${change.folderName}: verify failed on ${worktreeBranch(change.folderName)} merged with ${defaultBranch}:\n${outputTail(output, config.limits.cardOutputLines)}`,
  );
}

/** The one progress line announcing the sync. */
function progressLine(
  defaultBranch: string,
  folderName: string,
  commits: number,
  verifyCommand: string,
): string {
  const noun = commits === 1 ? 'commit' : 'commits';
  const verify = verifyCommand === '' ? '' : ` and running verify: ${verifyCommand}`;
  return `${defaultBranch} has ${commits} new ${noun}; merging into ${worktreeBranch(folderName)}${verify}`;
}

/** Append one event to the archived folder's change stream, as the watcher does. */
async function appendSyncEvent(
  changeFolderPath: string,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const eventsDir = path.join(changeFolderPath, '.run', 'events');
  await fs.mkdir(eventsDir, { recursive: true });
  const event = { type, timestamp: new Date().toISOString(), data };
  await fs.appendFile(path.join(eventsDir, 'change.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
}

/** The archived change's change stream, relative to the worktree root. */
function eventsRelative(worktreeRoot: string, changeFolderPath: string): string {
  return path
    .relative(worktreeRoot, path.join(changeFolderPath, '.run', 'events', 'change.jsonl'))
    .split(path.sep)
    .join('/');
}

/**
 * Take the default branch into an archived change's branch, in the change's
 * worktree, rebuilding each living spec the change writes from the default
 * branch's copy plus the change's deltas. Announces itself through `progress`,
 * runs the proposal's verify, and stages the sync's events. Every stop aborts
 * the merge and leaves HEAD where it was with an empty status. Reports whether
 * it merged.
 */
export async function syncWithDefaultBranch(
  _projectRoot: string,
  config: OsqConfig,
  change: LocatedChange,
  progress?: (line: string) => void,
): Promise<{ merged: boolean }> {
  const worktreeRoot = change.tree.root;
  const vcs = await selectVcs(worktreeRoot, config);
  const defaultBranch = await vcs.defaultBranch();
  const head = await vcs.head();
  if (head.sha !== null && (await vcs.isAncestor(defaultBranch, head.sha))) {
    return { merged: false };
  }

  const baseCommit = await readBaseCommit(change.folderPath);
  await assertRequirementsUnchanged(vcs, change, baseCommit, defaultBranch, config);

  const proposal = await parseSpecMdFromFolder(change.folderPath).catch(() => null);
  const verifyCommand = proposal?.verify ?? '';
  const commits = await vcs.countCommits(head.sha ?? 'HEAD', defaultBranch);
  progress?.(progressLine(defaultBranch, change.folderName, commits, verifyCommand));

  const capabilities = await listDeltaCapabilities(change.folderPath);
  const allowed = new Set(capabilities.map((capability) => livingSpecPath(config, capability)));
  const mergeStart = Date.now();
  let merge: VcsMergeResult;
  try {
    merge = await vcs.merge(defaultBranch, false);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  if (merge.status === 'conflict') {
    const blocked = merge.conflicts.filter((conflict) => !allowed.has(conflict));
    if (blocked.length > 0) {
      await vcs.mergeAbort().catch(() => undefined);
      throw conflictStop(change, defaultBranch, blocked);
    }
  }

  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');
  try {
    await rebuildLivingSpecs(worktreeRoot, change.folderPath, vcs, defaultBranch, config);
    await runPrepare(worktreeRoot, config, worktreeBranch(change.folderName));
    if (verifyCommand !== '') {
      const result = await runVerificationCommand(
        worktreeRoot,
        verifyCommand,
        config.timeouts.verifyTimeoutSeconds,
        null,
      );
      if (result.exitCode !== 0) throw verifyStop(change, defaultBranch, result.output, config);
      await appendSyncEvent(change.folderPath, 'verify_ran', {
        command: verifyCommand,
        exitCode: result.exitCode,
        duration: Math.round(result.duration * 1000),
        ...(result.output.trim() ? { output: result.output } : {}),
      });
    }
    await appendSyncEvent(change.folderPath, 'synced', {
      defaultBranch,
      commits,
      duration: Date.now() - mergeStart,
    });
    await vcs.stage([eventsRelative(worktreeRoot, change.folderPath)]);
    await vcs.commit([], syncMessage(change.folderName, defaultBranch), author);
  } catch (error) {
    await abortMerge(vcs, error);
  }
  return { merged: true };
}
