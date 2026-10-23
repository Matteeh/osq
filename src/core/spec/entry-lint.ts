import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { entryExists } from '../run/entry-paths.js';
import { resolveScope, scopeCoversPath } from '../run/scope.js';
import { changesDirLabel, listChanges } from '../status/change-locations.js';
import { selectVcs } from '../vcs/select.js';
import type { Vcs } from '../vcs/vcs.js';
import { parseTaskMd } from './parser.js';
import { readDependencyState } from './stack-dependencies.js';

/** One task's entry declarations as the lint reads them, in task order. */
export interface EntryLintTask {
  /** The task's numeric file stem, such as `1`. */
  readonly number: string;
  /** Repository-relative path of the task's file. */
  readonly repositoryPath: string;
  readonly scope: readonly string[];
  readonly entry: readonly string[];
}

/** One entry the change cannot provide: the task file and the error message. */
export interface EntryFinding {
  readonly file: string;
  readonly message: string;
}

/** A pattern entry is a glob or a trailing-directory form, as scope reads it. */
function isPatternEntry(entry: string): boolean {
  const trimmed = entry.trim();
  return /[*?]/.test(trimmed) || trimmed.endsWith('/');
}

/** POSIX form of a path, for comparing an entry against the repository layout. */
function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * The part of `entry` inside the change folder being linted, or null when the
 * entry names no path there. The entry may carry the folder's place in any
 * tree, or resolve from the project root into the folder.
 */
function entryInsideChangeFolder(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
  entry: string,
): string | null {
  const folder = path.basename(folderPath);
  const prefix = `${toPosix(changesDirLabel(config))}/${folder}/`;
  const normalized = toPosix(entry.trim());
  if (normalized.startsWith(prefix)) return normalized.slice(prefix.length);

  const absolute = path.resolve(projectRoot, entry);
  const relative = path.relative(path.resolve(folderPath), absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return toPosix(relative);
}

/**
 * Whether `entry` names a path inside the change folder that exists there,
 * wherever that folder is. The rest of the entry is read inside the folder: a
 * plain path must exist there, and a pattern must match a file there.
 */
async function providedInsideChangeFolder(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
  entry: string,
): Promise<boolean> {
  const rest = entryInsideChangeFolder(projectRoot, config, folderPath, entry);
  if (rest === null) return false;
  if (isPatternEntry(rest)) {
    const matches = await resolveScope(folderPath, [rest]);
    return matches.some((match) => match.absolutePath !== null);
  }
  return entryExists(folderPath, rest);
}

/**
 * Whether one entry exists in the tree the task runs in: the default branch
 * tip under git, the project root otherwise. A pattern counts as present when
 * `resolveScope` matches it to a file in the project root, exactly as the
 * runner's `entryExists` check reads it.
 */
async function entryInTree(
  projectRoot: string,
  vcs: Vcs,
  git: boolean,
  defaultBranch: string | null,
  entry: string,
): Promise<boolean> {
  if (isPatternEntry(entry)) {
    const matches = await resolveScope(projectRoot, [entry]);
    return matches.some((match) => match.absolutePath !== null);
  }
  if (git && defaultBranch !== null) {
    return vcs.pathExists(defaultBranch, entry);
  }
  return entryExists(projectRoot, entry);
}

/** Whether any task of the change at `folderPath` covers `entry` with scope. */
async function changeTaskScopeCovers(folderPath: string, entry: string): Promise<boolean> {
  const tasksDir = path.join(folderPath, 'tasks');
  const files = await fs.readdir(tasksDir).catch(() => []);
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await fs.readFile(path.join(tasksDir, file), 'utf8').catch(() => '');
    if (scopeCoversPath(parseTaskMd(content).scope, entry)) return true;
  }
  return false;
}

/**
 * Whether an approved or archived change other than the linted one covers
 * `entry` with one task's scope, because approval may stack this change on it.
 * Read only when the entry is otherwise missing.
 */
async function providedByApprovedChange(
  projectRoot: string,
  config: OsqConfig,
  vcs: Vcs,
  folderPath: string,
  entry: string,
): Promise<boolean> {
  const lintedFolder = path.basename(folderPath);
  for (const change of await listChanges(projectRoot, config)) {
    if (change.folderName === lintedFolder) continue;
    const state = await readDependencyState(projectRoot, config, vcs, change.folderName);
    if (state.state !== 'approved' && state.state !== 'archived') continue;
    if (await changeTaskScopeCovers(change.folderPath, entry)) return true;
  }
  return false;
}

/**
 * One `{ file, message }` per entry path a task of the change declares that
 * neither the change folder, the default branch or project root, nor any
 * approved stacked change can provide, as spec-lint-and-approve "Entry paths
 * exist" lists. Tasks are read in task order, so an earlier task's `scope`
 * provides a later task's `entry`.
 *
 * @scenario spec-lint-and-approve: Entry names a file no tree has
 * @scenario spec-lint-and-approve: Entries the change provides
 * @scenario spec-lint-and-approve: Entries inside the change folder
 * @scenario spec-lint-and-approve: Steered change linted from main
 * @adr 006
 */
export async function missingEntryFindings(
  projectRoot: string,
  config: OsqConfig,
  folderPath: string,
  tasks: readonly EntryLintTask[],
): Promise<EntryFinding[]> {
  const vcs = await selectVcs(projectRoot, config);
  const git = config.vcs?.enabled === true && vcs.kind === 'git';
  const defaultBranch = git ? await vcs.defaultBranch() : null;
  const treeName = git && defaultBranch !== null ? defaultBranch : 'the project';

  const findings: EntryFinding[] = [];
  const earlierScopes: Array<readonly string[]> = [];
  for (const task of tasks) {
    const coveringScopes = [...earlierScopes, task.scope];
    for (const entry of task.entry) {
      let provided = await providedInsideChangeFolder(projectRoot, config, folderPath, entry);
      if (!provided) provided = coveringScopes.some((scope) => scopeCoversPath(scope, entry));
      if (!provided) provided = await entryInTree(projectRoot, vcs, git, defaultBranch, entry);
      if (!provided) {
        provided = await providedByApprovedChange(projectRoot, config, vcs, folderPath, entry);
      }
      if (!provided) {
        findings.push({
          file: task.repositoryPath,
          message: `Task ${task.number} entry names ${entry}, which is not in ${treeName} and no task up to this one creates`,
        });
      }
    }
    earlierScopes.push(task.scope);
  }
  return findings;
}
