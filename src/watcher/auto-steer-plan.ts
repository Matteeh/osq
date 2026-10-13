/**
 * The plan files of a change folder: every file outside `.run/`, used to tell
 * which plan files the steering planner added, changed, or removed. The
 * planner keeps these edits whatever the outcome.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

async function walk(folderPath: string, dir: string, files: Map<string, Buffer>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === '.run') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(folderPath, full, files);
      continue;
    }
    if (!entry.isFile()) continue;
    const data = await fs.readFile(full).catch(() => null);
    if (data !== null) files.set(toPosix(path.relative(folderPath, full)), data);
  }
}

/**
 * Every file in the change folder outside `.run/`, change-folder-relative.
 *
 * @scenario watcher-and-harness: Blocked task gets a revised plan
 * @adr 018
 */
export async function snapshotPlanFiles(folderPath: string): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  await walk(folderPath, folderPath, files);
  return files;
}

/**
 * The change-folder-relative POSIX paths added, changed, or removed since the
 * snapshot, sorted.
 *
 * @scenario watcher-and-harness: Blocked task gets a revised plan
 * @adr 018
 */
export async function diffPlanFiles(
  folderPath: string,
  before: Map<string, Buffer>,
): Promise<string[]> {
  const after = await snapshotPlanFiles(folderPath);
  const changed: string[] = [];
  for (const relative of new Set([...before.keys(), ...after.keys()])) {
    const previous = before.get(relative);
    const current = after.get(relative);
    if (previous === undefined || current === undefined) {
      changed.push(relative);
      continue;
    }
    if (!previous.equals(current)) changed.push(relative);
  }
  return changed.sort();
}
