import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import type { Logger } from '../core/foundation/logger.js';
import { commitDeadTask } from '../core/run/dead-commit.js';
import { commitArchive, commitVerifiedTask } from '../core/run/task-commit.js';
import { parseFrontmatter, parseTaskMd } from '../core/spec/parser.js';
import type { LocatedChange } from '../core/status/change-locations.js';
import { getEventsPath, getSpecsDir } from '../core/status/layout.js';
import { selectVcs } from '../core/vcs/select.js';
import type { Vcs, VcsStatusEntry } from '../core/vcs/vcs.js';
import { type RunTaskFailureReason, formatTaskOutcomeLine } from './outcome.js';
import { type WorktreeHalt, relativeChange } from './worktree-run.js';

/** A task's authored title and scope plus whether a human marked it done. */
interface TaskMeta {
  readonly title: string;
  readonly scope: string[];
  readonly manual: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read a task's title and scope plus its done marker's manual flag. */
async function readTaskMeta(folderPath: string, task: string): Promise<TaskMeta> {
  const content = await fs
    .readFile(path.join(folderPath, 'tasks', `${task}.md`), 'utf8')
    .catch(() => '');
  const data = parseTaskMd(content);
  const marker = await fs
    .readFile(path.join(folderPath, '.run', 'done', task), 'utf8')
    .catch(() => '');
  return {
    title: data.title,
    scope: data.scope,
    manual: parseFrontmatter(marker).data.manual === true,
  };
}

/** Whole seconds since the task's last `started` event, 0 without one. */
async function elapsedWholeSeconds(folderPath: string, task: string): Promise<number> {
  const raw = await fs.readFile(getEventsPath(folderPath, task), 'utf8').catch(() => '');
  let latest: number | null = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let event: { type?: unknown; timestamp?: unknown };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type !== 'started' || typeof event.timestamp !== 'string') continue;
    const at = Date.parse(event.timestamp);
    if (!Number.isNaN(at)) latest = at;
  }
  return latest === null ? 0 : Math.max(0, Math.floor((Date.now() - latest) / 1000));
}

/** Make a verified commit for one task, returning a `commit_failed` halt on failure. */
async function commitVerified(
  vcs: Vcs,
  config: OsqConfig,
  folderPath: string,
  task: string,
  meta: TaskMeta,
): Promise<WorktreeHalt | null> {
  try {
    const seconds = await elapsedWholeSeconds(folderPath, task);
    const outcomeLine = formatTaskOutcomeLine(task, true, undefined, seconds, false);
    await commitVerifiedTask(
      vcs,
      config,
      folderPath,
      Number(task),
      meta.title,
      outcomeLine,
      meta.scope,
    );
    return null;
  } catch (err) {
    return { reason: 'commit_failed', detail: errorMessage(err) };
  }
}

/** Commit the task that just passed in a worktree. */
export async function commitWorktreeVerifiedTask(
  change: LocatedChange,
  config: OsqConfig,
  task: string,
): Promise<WorktreeHalt | null> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return null;
  return commitVerified(
    vcs,
    config,
    change.folderPath,
    task,
    await readTaskMeta(change.folderPath, task),
  );
}

/** Done markers status lists but the branch has not committed yet, in task order. */
function pendingDoneTasks(entries: readonly VcsStatusEntry[], changeRel: string): string[] {
  const prefix = `${changeRel}/.run/done/`;
  const numbers = new Set<string>();
  for (const entry of entries) {
    if (entry.code !== '??' && !entry.code.startsWith('A')) continue;
    if (!entry.path.startsWith(prefix)) continue;
    const number = entry.path.slice(prefix.length);
    if (/^\d+$/.test(number)) numbers.add(number);
  }
  return [...numbers].sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10));
}

/**
 * Make the verified-task commit, in task order, for every done marker status
 * lists but the branch has not committed, skipping human `manual: true` ones.
 */
export async function commitPendingVerifiedTasks(
  change: LocatedChange,
  config: OsqConfig,
): Promise<WorktreeHalt | null> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return null;
  const changeRel = relativeChange(change.tree.root, change.folderPath);
  for (const task of pendingDoneTasks(await vcs.status(), changeRel)) {
    const meta = await readTaskMeta(change.folderPath, task);
    if (meta.manual) continue;
    const halt = await commitVerified(vcs, config, change.folderPath, task, meta);
    if (halt) return halt;
  }
  return null;
}

/** Record a dead task through `commitDeadTask`, returning a `commit_failed` halt. */
export async function commitWorktreeDeadTask(
  change: LocatedChange,
  config: OsqConfig,
  task: string,
  reason: RunTaskFailureReason,
): Promise<WorktreeHalt | null> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return null;
  const meta = await readTaskMeta(change.folderPath, task);
  try {
    const seconds = await elapsedWholeSeconds(change.folderPath, task);
    const outcomeLine = formatTaskOutcomeLine(task, false, reason, seconds, false);
    await commitDeadTask(
      vcs,
      config,
      change.folderPath,
      Number(task),
      reason,
      meta.title,
      outcomeLine,
    );
    return null;
  } catch (err) {
    return { reason: 'commit_failed', detail: errorMessage(err) };
  }
}

/** The archive folder names present under one archive directory. */
export async function readArchiveNames(archiveDir: string): Promise<Set<string>> {
  const entries = await fs.readdir(archiveDir, { withFileTypes: true }).catch(() => []);
  return new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
}

/** The archive folder that appeared after an archive move, or null. */
export async function newArchiveName(
  archiveDir: string,
  before: ReadonlySet<string>,
): Promise<string | null> {
  for (const name of await readArchiveNames(archiveDir)) {
    if (!before.has(name)) return name;
  }
  return null;
}

/**
 * Commit one archived change in a worktree. A failure only logs git's output;
 * it never halts, so the worktree is left as it is.
 */
export async function commitWorktreeArchive(
  change: LocatedChange,
  config: OsqConfig,
  archiveName: string,
  title: string,
  logger?: Logger,
): Promise<void> {
  const vcs = await selectVcs(change.tree.root, config);
  if (vcs.kind !== 'git') return;
  const root = (await vcs.root()) ?? change.tree.root;
  const archivePath = path
    .relative(root, path.join(change.tree.archiveDir, archiveName))
    .split(path.sep)
    .join('/');
  try {
    await commitArchive(
      vcs,
      config,
      change.folderPath,
      change.tree.archiveDir,
      getSpecsDir(config.paths.openspecRoot, root),
      archivePath,
      title,
    );
  } catch (err) {
    logger?.warn(`archive commit failed: ${errorMessage(err)}`);
  }
}
