import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { getChangeRunDir, getDeadMarkerPath, getEventsPath } from '../status/layout.js';
import type { Vcs, VcsStatusEntry } from '../vcs/vcs.js';
import { formatCommitMessage, readCommitTrailers } from './commit-message.js';

/** The worktree-root-relative POSIX path of one absolute path. */
function relativeToRoot(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/** Whether a status path is the change folder or a file below it. */
function insideChange(candidate: string, changeRel: string): boolean {
  if (changeRel === '' || changeRel === '.') return true;
  return candidate === changeRel || candidate.startsWith(`${changeRel}/`);
}

/** The change folder's numeric prefix, else its whole base name. */
function changeId(changeFolder: string): string {
  const base = path.basename(changeFolder);
  return /^(\d+)/.exec(base)?.[1] ?? base;
}

/** Every status path outside the change folder, a rename's source included. */
function outsideChange(entries: readonly VcsStatusEntry[], changeRel: string): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    for (const candidate of [entry.path, entry.from]) {
      if (candidate === undefined || insideChange(candidate, changeRel)) continue;
      paths.push(candidate);
    }
  }
  return [...new Set(paths)];
}

/** Whether a file exists, without surfacing the error. */
async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

/**
 * Record a dead task in its osq worktree: write the agent's patch, discard
 * everything the agent changed outside the change folder, then commit whichever
 * `.run/` records exist. Fails before writing anything when `vcs.author` is
 * unset. Returns the new commit.
 */
export async function commitDeadTask(
  vcs: Vcs,
  config: OsqConfig,
  changeFolder: string,
  taskNumber: number,
  reason: string,
  title: string,
  outcomeLine: string,
): Promise<string> {
  const author = config.vcs?.author;
  if (author === undefined || author.trim() === '') {
    throw new Error('vcs.author is required to commit a dead task');
  }
  const root = await vcs.root();
  if (root === null) throw new Error('a dead task requires a git worktree');
  const changeRaw = path.isAbsolute(changeFolder) ? changeFolder : path.resolve(root, changeFolder);
  const changeAbs = await fs.realpath(changeRaw).catch(() => changeRaw);
  const changeRel = relativeToRoot(root, changeAbs);
  const task = String(taskNumber);
  const deadMarker = getDeadMarkerPath(changeAbs, task);
  const deadPatch = path.join(getChangeRunDir(changeAbs), 'dead', `${task}.patch`);
  const events = getEventsPath(changeAbs, task);

  await fs.mkdir(path.dirname(deadPatch), { recursive: true });
  await fs.writeFile(deadPatch, await vcs.patch(), 'utf8');

  await vcs.discard(outsideChange(await vcs.status(), changeRel));

  const committed: string[] = [];
  for (const file of [deadMarker, deadPatch, events]) {
    if (await exists(file)) committed.push(relativeToRoot(root, file));
  }

  const subject = `osq: ${changeId(changeAbs)} task ${task} dead, reason ${reason}`;
  const trailers = await readCommitTrailers(changeAbs, task);
  const message = formatCommitMessage({ subject, title, outcomeLine, trailers });
  return vcs.commit(committed, message, author);
}
