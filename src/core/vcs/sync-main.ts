import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { runPrepare } from '../spec/approve-worktree.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import type { LocatedChange } from '../status/change-locations.js';
import { getSpecsDir } from '../status/layout.js';
import { selectVcs } from './select.js';
import { eventsRelative, readEvents, readRequirementsBase, restoreEvents } from './sync-files.js';
import { assertRequirementsUnchanged, rebuildLivingSpecs } from './sync-specs.js';
import { SyncStop } from './sync-stop.js';
import { type SyncVerifyTask, runSyncVerify, syncVerifyTasks } from './sync-verify.js';
import type { Vcs, VcsMergeResult } from './vcs.js';
import { worktreeBranch } from './worktree.js';

/** The values the sync captured before its first write. */
interface SyncContext {
  readonly archived: boolean;
  readonly eventsPath: string;
  readonly eventsBefore: string | null;
  readonly author: string;
  readonly verifyCommand: string;
  readonly tasks: readonly SyncVerifyTask[];
  readonly commits: number;
}

/** The sync commit's subject and change trailer. */
function syncMessage(folderName: string, defaultBranch: string): string {
  const id = folderName.split('-')[0] ?? folderName;
  return `osq: ${id} sync ${defaultBranch}\n\nOsq-Change: ${folderName}`;
}

/** Abort the merge, restore the events, and stop with `error`. */
async function stopAfter(
  vcs: Vcs,
  error: unknown,
  eventsPath: string,
  before: string | null,
): Promise<SyncStop> {
  await vcs.mergeAbort().catch(() => undefined);
  await restoreEvents(eventsPath, before);
  if (error instanceof SyncStop) return error;
  return new SyncStop('sync_failed', error instanceof Error ? error.message : String(error));
}

/** Whether `target` is `prefix` or under it. */
function isUnder(prefix: string, target: string): boolean {
  return target === prefix || target.startsWith(`${prefix}/`);
}

/** The conflict paths neither the living specs nor the archive directory owns. */
function blockedConflicts(
  conflicts: readonly string[],
  config: OsqConfig,
  change: LocatedChange,
): string[] {
  const specs = getSpecsDir(config.paths.openspecRoot).split(path.sep).join('/');
  const archive = path.relative(change.tree.root, change.tree.archiveDir).split(path.sep).join('/');
  return conflicts.filter((conflict) => !isUnder(specs, conflict) && !isUnder(archive, conflict));
}

/** The stop raised when a code path conflicts with the default branch. */
function conflictStop(
  change: LocatedChange,
  defaultBranch: string,
  blocked: readonly string[],
): SyncStop {
  const id = change.folderName.split('-')[0] ?? change.folderName;
  return new SyncStop(
    'sync_conflict',
    `${change.folderName}: ${blocked.join(', ')} conflict with ${defaultBranch}; run osq plan ${id}, and approving the revised plan restarts ${worktreeBranch(change.folderName)} from ${defaultBranch}`,
  );
}

/** The one progress line announcing the sync. */
function progressLine(
  defaultBranch: string,
  folderName: string,
  commits: number,
  suffix: string,
): string {
  const noun = commits === 1 ? 'commit' : 'commits';
  return `${defaultBranch} has ${commits} new ${noun}; merging into ${worktreeBranch(folderName)}${suffix}`;
}

/** The verify suffix the progress line adds for the change's kind. */
function verifySuffix(
  archived: boolean,
  verifyCommand: string,
  tasks: readonly SyncVerifyTask[],
  skipVerify: boolean,
): string {
  if (skipVerify) return '';
  if (archived) return verifyCommand === '' ? '' : ` and running verify: ${verifyCommand}`;
  if (tasks.length === 0) return '';
  return ` and re-running verify for tasks ${tasks.map((task) => task.task).join(', ')}`;
}

/** Refuse the sync's early stops and capture what step 5 needs. */
async function prepareSync(
  change: LocatedChange,
  vcs: Vcs,
  config: OsqConfig,
  defaultBranch: string,
  headSha: string | null,
  progress: ((line: string) => void) | undefined,
  skipVerify: boolean,
): Promise<SyncContext> {
  const archived = change.location !== 'active';
  const eventsPath = path.join(change.folderPath, '.run', 'events', 'change.jsonl');
  const eventsBefore = await readEvents(eventsPath);
  await assertRequirementsUnchanged(
    vcs,
    change,
    await readRequirementsBase(change.folderPath),
    defaultBranch,
    config,
  );
  const author = config.vcs?.author;
  if (author === undefined) {
    throw new SyncStop('sync_failed', 'vcs.author is required when vcs.enabled is true');
  }
  const proposal = await parseSpecMdFromFolder(change.folderPath).catch(() => null);
  const verifyCommand = proposal?.verify ?? '';
  const tasks = archived ? [] : await syncVerifyTasks(change);
  const commits = await vcs.countCommits(headSha ?? 'HEAD', defaultBranch);
  progress?.(
    progressLine(
      defaultBranch,
      change.folderName,
      commits,
      verifySuffix(archived, verifyCommand, tasks, skipVerify),
    ),
  );
  return { archived, eventsPath, eventsBefore, author, verifyCommand, tasks, commits };
}

/** Abort and stop on a conflict the sync cannot resolve, else return. */
async function assertResolvableConflict(
  vcs: Vcs,
  config: OsqConfig,
  change: LocatedChange,
  defaultBranch: string,
  merge: VcsMergeResult,
  context: SyncContext,
): Promise<void> {
  if (merge.status !== 'conflict') return;
  const blocked = blockedConflicts(merge.conflicts, config, change);
  if (blocked.length === 0) return;
  await vcs.mergeAbort().catch(() => undefined);
  await restoreEvents(context.eventsPath, context.eventsBefore);
  throw conflictStop(change, defaultBranch, blocked);
}

/** Steps 3 through 6 of a started merge. */
async function finishSync(
  worktreeRoot: string,
  change: LocatedChange,
  vcs: Vcs,
  config: OsqConfig,
  defaultBranch: string,
  merge: VcsMergeResult,
  mergeStart: number,
  context: SyncContext,
  skipVerify: boolean,
): Promise<void> {
  await rebuildLivingSpecs(
    worktreeRoot,
    change,
    vcs,
    defaultBranch,
    config,
    context.archived,
    merge.conflicts,
  );
  await runPrepare(worktreeRoot, config, worktreeBranch(change.folderName));
  await runSyncVerify({
    worktreeRoot,
    change,
    config,
    defaultBranch,
    archived: context.archived,
    verifyCommand: context.verifyCommand,
    commits: context.commits,
    mergeStart,
    tasks: context.tasks,
    skipVerify,
  });
  await vcs.stage([eventsRelative(worktreeRoot, change.folderPath)]);
  await vcs.commit([], syncMessage(change.folderName, defaultBranch), context.author);
}

/** Take the default branch into a change's branch, for active or archived. */
export async function syncWithDefaultBranch(
  _projectRoot: string,
  config: OsqConfig,
  change: LocatedChange,
  progress?: (line: string) => void,
  options: { skipVerify?: boolean } = {},
): Promise<{ merged: boolean }> {
  const worktreeRoot = change.tree.root;
  const vcs = await selectVcs(worktreeRoot, config);
  const defaultBranch = await vcs.defaultBranch();
  const head = await vcs.head();
  if (head.sha !== null && (await vcs.isAncestor(defaultBranch, head.sha))) {
    return { merged: false };
  }
  const skipVerify = options.skipVerify === true;
  const context = await prepareSync(
    change,
    vcs,
    config,
    defaultBranch,
    head.sha,
    progress,
    skipVerify,
  );

  const mergeStart = Date.now();
  let merge: VcsMergeResult;
  try {
    merge = await vcs.merge(defaultBranch, false);
  } catch (error) {
    throw await stopAfter(vcs, error, context.eventsPath, context.eventsBefore);
  }
  await assertResolvableConflict(vcs, config, change, defaultBranch, merge, context);
  try {
    await finishSync(
      worktreeRoot,
      change,
      vcs,
      config,
      defaultBranch,
      merge,
      mergeStart,
      context,
      skipVerify,
    );
  } catch (error) {
    throw await stopAfter(vcs, error, context.eventsPath, context.eventsBefore);
  }
  return { merged: true };
}
