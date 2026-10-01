import fs from 'node:fs/promises';
import path from 'node:path';

/** A marker's non-blank trimmed contents, or null when absent or blank. */
async function readMarker(markerPath: string): Promise<string | null> {
  const content = await fs.readFile(markerPath, 'utf8').catch(() => '');
  const trimmed = content.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The requirements base the sync's requirement check compares against: the
 * commit in `.run/requirements-base`, else the one in `.run/base`, else null.
 */
export async function readRequirementsBase(folderPath: string): Promise<string | null> {
  const requirements = await readMarker(path.join(folderPath, '.run', 'requirements-base'));
  if (requirements !== null) return requirements;
  return readMarker(path.join(folderPath, '.run', 'base'));
}

/** The change stream's path relative to the worktree root. */
export function eventsRelative(worktreeRoot: string, changeFolderPath: string): string {
  return path
    .relative(worktreeRoot, path.join(changeFolderPath, '.run', 'events', 'change.jsonl'))
    .split(path.sep)
    .join('/');
}

/** The events file's contents before the sync, or null when it was absent. */
export async function readEvents(eventsPath: string): Promise<string | null> {
  return fs.readFile(eventsPath, 'utf8').catch(() => null);
}

/** Put the events file back as it was, or remove it when it was absent. */
export async function restoreEvents(eventsPath: string, before: string | null): Promise<void> {
  if (before === null) {
    await fs.rm(eventsPath, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(eventsPath), { recursive: true });
  await fs.writeFile(eventsPath, before, 'utf8');
}
