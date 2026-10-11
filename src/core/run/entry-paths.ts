import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveScope, scopeCoversPath } from './scope.js';

/** A task's entry declarations: the files its executor reads first. */
export interface EntryTask {
  readonly scope: readonly string[];
  readonly entry: readonly string[];
}

/**
 * True when `entry` names an existing file or directory under `root`, the tree
 * the task runs in. A missing path returns false rather than failing.
 *
 * @scenario watcher-and-harness: Entry path check before spawn
 * @scenario watcher-and-harness: Entries that count as present
 * @adr 006
 */
export async function entryExists(root: string, entry: string): Promise<boolean> {
  const stat = await fs.stat(path.resolve(root, entry)).catch(() => null);
  return stat !== null && (stat.isFile() || stat.isDirectory());
}

/** A pattern entry is a glob or a trailing-directory form, as scope reads it. */
function isPatternEntry(entry: string): boolean {
  const trimmed = entry.trim();
  return /[*?]/.test(trimmed) || trimmed.endsWith('/');
}

/**
 * The task's entry paths the tree cannot provide, in entry order. An entry is
 * present when the task's own `scope` covers it, when it names an existing file
 * or directory under `root`, or when it is a pattern that `resolveScope`
 * matches to at least one file.
 *
 * @scenario watcher-and-harness: Entry names a removed file
 * @scenario watcher-and-harness: Entries that count as present
 * @scenario watcher-and-harness: Steered task runs
 * @adr 006
 */
export async function missingEntryPaths(root: string, task: EntryTask): Promise<string[]> {
  const missing: string[] = [];
  for (const entry of task.entry) {
    if (scopeCoversPath(task.scope, entry)) continue;
    if (await entryExists(root, entry)) continue;
    if (isPatternEntry(entry)) {
      const matches = await resolveScope(root, [entry]);
      if (matches.some((match) => match.absolutePath !== null)) continue;
    }
    missing.push(entry);
  }
  return missing;
}
