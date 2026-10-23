import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { commitArchive } from '../run/task-commit.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import {
  type LocatedChange,
  findChange,
  listChanges,
  matchesFolder,
} from '../status/change-locations.js';
import { getEventsPath, getRegressedMarkerPath, getSpecsDir } from '../status/layout.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs } from '../vcs/vcs.js';
import type { RetryResult } from './retry.js';

const CHANGE_TARGET = 'change';

/** Files a refused archive retry puts back exactly as they were before it. */
export interface Rollback {
  /** Every file in `.run/regressed/` before the retry, keyed by file name. */
  readonly regressed: Readonly<Record<string, string>>;
  /** `.run/events/change.jsonl` before the retry, or null when it was absent. */
  readonly events: string | null;
}

/** Snapshot the archive files only a `commit_failed` retry may need to restore. */
export async function readRollback(
  folderPath: string,
  target: string,
  reason: string,
): Promise<Rollback | undefined> {
  if (target !== CHANGE_TARGET || reason !== 'commit_failed') return undefined;
  const dir = path.join(folderPath, '.run', 'regressed');
  const regressed: Record<string, string> = {};
  for (const name of await fs.readdir(dir).catch(() => [])) {
    regressed[name] = await fs.readFile(path.join(dir, name), 'utf8');
  }
  const events = await fs
    .readFile(getEventsPath(folderPath, CHANGE_TARGET), 'utf8')
    .catch(() => null);
  return { regressed, events };
}

/** A change folder's canonical id: its numeric prefix, or the whole name. */
function changeId(folderName: string): string {
  return folderName.match(/^(\d+)/)?.[1] ?? folderName;
}

/** Archived changes held by an osq worktree, in `changeTrees` order. */
async function archivedWorktreeChanges(
  projectRoot: string,
  config: OsqConfig,
): Promise<LocatedChange[]> {
  const archived = await listChanges(projectRoot, config, ['archived']);
  return archived.filter((change) => change.tree.worktreeFolder !== undefined);
}

/**
 * The change a retry names: `findChange`'s active match, otherwise the first
 * archived change in an osq worktree whose folder matches. A numeric target on
 * such an archived change is refused; no match rethrows `findChange`'s error.
 * @scenario cli-foundation: Retrying a land stop on an archived change
 * @scenario cli-foundation: Retrying a task of an archived change
 * @adr 003
 */
export async function findRetryChange(
  projectRoot: string,
  config: OsqConfig,
  idOrPrefix: string,
  target: string,
): Promise<LocatedChange> {
  try {
    return await findChange(projectRoot, config, idOrPrefix);
  } catch (notFound) {
    const match = (await archivedWorktreeChanges(projectRoot, config)).find((change) =>
      matchesFolder(change.folderName, idOrPrefix),
    );
    if (match === undefined) throw notFound;
    if (target.trim() !== CHANGE_TARGET) {
      throw new Error(
        `${match.folderName} has archived; osq retry clears only its land stop: osq retry ${changeId(match.folderName)} change`,
      );
    }
    return match;
  }
}

/** Put a file back exactly as it was, removing it when it was absent. */
async function restore(target: string, content: string | null): Promise<void> {
  if (content === null) {
    await fs.rm(target, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, 'utf8');
}

/** `target` relative to `root`, as a POSIX path git takes. */
function relativeTo(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/** Unstage and rewrite the archived folder's regressions and event stream. */
async function restoreRollback(vcs: Vcs, change: LocatedChange, rollback: Rollback): Promise<void> {
  const root = (await vcs.root()) ?? change.tree.root;
  const regressedDir = path.join(change.folderPath, '.run', 'regressed');
  const events = getEventsPath(change.folderPath, CHANGE_TARGET);
  const paths = [relativeTo(root, regressedDir), relativeTo(root, events)];
  await vcs.discard(paths).catch(() => undefined);
  await fs.rm(regressedDir, { recursive: true, force: true });
  await fs.mkdir(regressedDir, { recursive: true });
  for (const [name, content] of Object.entries(rollback.regressed)) {
    await fs.writeFile(path.join(regressedDir, name), content, 'utf8');
  }
  await restore(events, rollback.events);
}

/**
 * Restore the moved-away original folder from HEAD, then remove it again, so
 * its deletion is unstaged and `git add` can stage it on the next attempt.
 */
async function unstageOriginalFolder(vcs: Vcs, change: LocatedChange): Promise<void> {
  const root = (await vcs.root()) ?? change.tree.root;
  const originalFolder = path.join(change.tree.changesDir, change.folderName);
  await vcs.discard([relativeTo(root, originalFolder)]).catch(() => undefined);
  await fs.rm(originalFolder, { recursive: true, force: true });
}

/** Commit the whole archive for a human retry; on failure restore the retry files. */
async function commitFailedArchive(
  change: LocatedChange,
  config: OsqConfig,
  result: RetryResult,
): Promise<void> {
  const vcs = await selectVcs(change.tree.root, config);
  const root = (await vcs.root()) ?? change.tree.root;
  const title = (await parseSpecMdFromFolder(change.folderPath).catch(() => null))?.title ?? '';
  const originalFolder = path.join(change.tree.changesDir, change.folderName);
  try {
    await unstageOriginalFolder(vcs, change);
    await commitArchive(
      vcs,
      config,
      originalFolder,
      change.tree.archiveDir,
      getSpecsDir(config.paths.openspecRoot, root),
      relativeTo(root, change.folderPath),
      title,
    );
  } catch (error) {
    if (result.rollback !== undefined) await restoreRollback(vcs, change, result.rollback);
    const output = error instanceof Error ? error.message : String(error);
    throw new Error(`osq could not commit the archive: ${output}`);
  }
}

/**
 * Commit the retry on the archived change's branch: the retained marker, the
 * removed `change.md` and `change.jsonl`, as `osq: <id> land retry`. A failed
 * commit puts the files back and throws `osq could not record the retry`.
 * @scenario cli-foundation: Retrying a land stop on an archived change
 * @adr 003
 */
export async function commitArchivedRetry(
  projectRoot: string,
  config: OsqConfig,
  result: RetryResult,
): Promise<void> {
  const change = (await archivedWorktreeChanges(projectRoot, config)).find(
    (candidate) => candidate.folderPath === result.folderPath,
  );
  if (change === undefined) return;
  if (result.target === CHANGE_TARGET && result.reason === 'commit_failed') {
    await commitFailedArchive(change, config, result);
    return;
  }
  const root = change.tree.root;
  const vcs = await selectVcs(root, config);
  const author = config.vcs?.author;
  if (author === undefined) throw new Error('vcs.author is required when vcs.enabled is true');

  const marker = getRegressedMarkerPath(change.folderPath, CHANGE_TARGET);
  const events = getEventsPath(change.folderPath, CHANGE_TARGET);
  const retained = result.retainedMarkers.map((relative) => path.join(change.folderPath, relative));
  const files = [marker, events, ...retained];
  const paths = files.map((target) => relativeTo(root, target));
  const earlier = await Promise.all(paths.map((relative) => vcs.show('HEAD', relative)));

  try {
    await vcs.commit(paths, `osq: ${result.specId} land retry`, author);
  } catch (error) {
    await vcs.discard(paths).catch(() => undefined);
    for (const [index, target] of files.entries()) {
      await restore(target, earlier[index] ?? null);
    }
    const output = error instanceof Error ? error.message : String(error);
    throw new Error(`osq could not record the retry: ${output}`);
  }
}
