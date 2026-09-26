import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { getDoneMarkerPath, getEventsPath, getResultPath } from '../status/layout.js';
import type { Vcs, VcsStatusEntry } from '../vcs/vcs.js';
import { formatCommitMessage, readCommitTrailers } from './commit-message.js';
import { scopeCoversPath } from './scope.js';

/** The worktree-root-relative POSIX path of one absolute path. */
function relativeToRoot(root: string, target: string): string {
  return path.relative(root, target).split(path.sep).join('/');
}

/** The change folder's numeric prefix, else its whole base name. */
function changeId(changeFolder: string): string {
  const base = path.basename(changeFolder);
  return /^(\d+)/.exec(base)?.[1] ?? base;
}

/** Resolve a possibly-relative change folder against the repository root. */
function absoluteChange(root: string, changeFolder: string): string {
  return path.isAbsolute(changeFolder) ? changeFolder : path.resolve(root, changeFolder);
}

/** The required commit author, or a thrown error when it is missing. */
function requireAuthor(config: OsqConfig): string {
  const author = config.vcs?.author;
  if (author === undefined || author.trim() === '') {
    throw new Error('vcs.author is required to commit a task');
  }
  return author;
}

/** Whether a file exists, without surfacing the error. */
async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

/** The existing subset of `paths`, root-relative and sorted. */
async function existingPaths(root: string, paths: Iterable<string>): Promise<string[]> {
  const present: string[] = [];
  for (const relative of new Set(paths)) {
    if (await exists(path.join(root, relative))) present.push(relative);
  }
  return present.sort();
}

/** Status paths the task's scope covers, plus untracked new test files. */
function scopedStatusPaths(entries: readonly VcsStatusEntry[], scope: readonly string[]): string[] {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (entry.code === '??' && entry.path.startsWith('tests/')) paths.add(entry.path);
    for (const candidate of [entry.path, entry.from]) {
      if (candidate !== undefined && scopeCoversPath(scope, candidate)) paths.add(candidate);
    }
  }
  return [...paths];
}

/** Every path one verified task's commit holds, root-relative and existing. */
async function verifiedCommitPaths(
  root: string,
  changeAbs: string,
  task: string,
  scope: readonly string[],
  status: readonly VcsStatusEntry[],
): Promise<string[]> {
  const selected = new Set(scopedStatusPaths(status, scope));
  for (const record of [
    getDoneMarkerPath(changeAbs, task),
    getResultPath(changeAbs, task),
    getEventsPath(changeAbs, task),
    path.join(changeAbs, 'tasks.md'),
  ]) {
    selected.add(relativeToRoot(root, record));
  }
  return existingPaths(root, selected);
}

/**
 * Commit one verified task in an osq worktree: every status path its scope
 * covers, a rename's source included, every untracked `tests/` file, and the
 * change folder's `.run/done/<n>`, `.run/results/<n>.md`, `.run/events/<n>.jsonl`,
 * and `tasks.md`.
 */
export async function commitVerifiedTask(
  vcs: Vcs,
  config: OsqConfig,
  changeFolder: string,
  taskNumber: number,
  title: string,
  outcomeLine: string,
  scope: readonly string[],
): Promise<string> {
  const author = requireAuthor(config);
  const root = await vcs.root();
  if (root === null) throw new Error('a verified task commit requires a git worktree');
  const changeAbs = absoluteChange(root, changeFolder);
  const task = String(taskNumber);
  const paths = await verifiedCommitPaths(root, changeAbs, task, scope, await vcs.status());
  const subject = `osq: ${changeId(changeAbs)} task ${task} verified`;
  const trailers = await readCommitTrailers(changeAbs, task);
  return vcs.commit(paths, formatCommitMessage({ subject, title, outcomeLine, trailers }), author);
}

/** Whether a status path lives under one of the commit's three directories. */
function underAny(candidate: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`));
}

/**
 * Commit an archive in an osq worktree: the change folder's old path, the
 * tree's archive directory, and the living specs directory, as one commit with
 * the proposal's title, `archived to <archivePath>`, and the `Osq-Change`
 * trailer.
 */
export async function commitArchive(
  vcs: Vcs,
  config: OsqConfig,
  changeFolder: string,
  archiveDir: string,
  specsDir: string,
  archivePath: string,
  title: string,
): Promise<string> {
  const author = requireAuthor(config);
  const root = await vcs.root();
  if (root === null) throw new Error('an archive commit requires a git worktree');
  const changeAbs = absoluteChange(root, changeFolder);
  const prefixes = [
    relativeToRoot(root, changeAbs),
    relativeToRoot(root, archiveDir),
    relativeToRoot(root, specsDir),
  ];
  const paths = new Set<string>();
  for (const entry of await vcs.status()) {
    for (const candidate of [entry.path, entry.from]) {
      if (candidate !== undefined && underAny(candidate, prefixes)) paths.add(candidate);
    }
  }
  const folderName = path.basename(changeAbs);
  const message = formatCommitMessage({
    subject: `osq: ${changeId(changeAbs)} archived`,
    title,
    outcomeLine: `archived to ${archivePath}`,
    trailers: [{ key: 'Osq-Change', value: folderName }],
  });
  return vcs.commit([...paths].sort(), message, author);
}
