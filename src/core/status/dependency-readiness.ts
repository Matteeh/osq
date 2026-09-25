import fs from 'node:fs/promises';
import path from 'node:path';
import { readVerification } from './verification.js';

/** Directory entries, or an empty list when the directory cannot be read. */
export async function listDir(dir: string): Promise<string[]> {
  return fs.readdir(dir).catch(() => []);
}

async function findFolder(parent: string, prefix: string): Promise<string | null> {
  const entries = await listDir(parent);
  return entries.find((entry) => entry === prefix || entry.startsWith(`${prefix}-`)) ?? null;
}

/** True while an archived change requires a verification outcome that has not passed. */
export async function isVerificationPending(folderPath: string): Promise<boolean> {
  const { required, outcome } = await readVerification(folderPath);
  return required && outcome !== 'passed';
}

/**
 * Runtime dependency completion: an archived dependency counts as met only when
 * its recorded verification is not pending. A rejected dependency and an
 * unfinished active change are never met.
 */
export async function isDependencyDone(changesDir: string, dependency: string): Promise<boolean> {
  const padded = dependency.padStart(3, '0');
  const archived = await findFolder(path.join(changesDir, 'archive'), padded);
  if (archived) return !(await isVerificationPending(path.join(changesDir, 'archive', archived)));
  if (await findFolder(path.join(changesDir, 'rejected'), padded)) return false;
  const active = await findFolder(changesDir, padded);
  if (!active) return false;
  const dependencyFolder = path.join(changesDir, active);
  const taskFiles = (await listDir(path.join(dependencyFolder, 'tasks'))).filter((entry) =>
    entry.endsWith('.md'),
  );
  if (taskFiles.length === 0) return false;
  const done = new Set(await listDir(path.join(dependencyFolder, '.run', 'done')));
  return taskFiles.every((entry) => done.has(entry.replace(/\.md$/, '')));
}
