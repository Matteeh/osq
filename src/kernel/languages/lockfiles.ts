import { LANGUAGE_PRESETS } from './presets.js';

/** The offline command that rebuilds each lock file osq knows how to rebuild. */
const LOCK_REBUILD_COMMANDS: ReadonlyMap<string, string> = new Map([
  ['Cargo.lock', 'cargo update --workspace --offline'],
]);

/** The folder part of a POSIX path, `''` for a root file. */
function folderOf(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  return slash === -1 ? '' : filePath.slice(0, slash);
}

/** The file part of a POSIX path. */
function baseNameOf(filePath: string): string {
  const slash = filePath.lastIndexOf('/');
  return slash === -1 ? filePath : filePath.slice(slash + 1);
}

/** Whether `folder` is `parent` or a folder below it. */
function isAtOrBelow(folder: string, parent: string): boolean {
  if (parent === '') return true;
  return folder === parent || folder.startsWith(`${parent}/`);
}

/**
 * The offline command that rebuilds `lockfile` from its manifests, run in the
 * lock file's folder, or `null` when osq knows none. This is pure: it reads no
 * file.
 *
 * @scenario languages: Rebuild command of a lock file
 * @adr 017
 */
export function lockRebuildCommand(lockfile: string): string | null {
  return LOCK_REBUILD_COMMANDS.get(baseNameOf(lockfile)) ?? null;
}

/**
 * Whether `lockfile` is a lock file of a language whose manifest is one of
 * `manifests`, in the lock file's folder or a folder below it. A lock file at
 * the project root follows a manifest in any folder. This is pure: it reads no
 * file.
 *
 * @scenario languages: Lock files and the manifests they follow
 * @adr 017
 */
export function lockfileFollowsManifest(lockfile: string, manifests: readonly string[]): boolean {
  const lockBase = baseNameOf(lockfile);
  const lockFolder = folderOf(lockfile);
  for (const preset of LANGUAGE_PRESETS) {
    if (!preset.lockFiles.includes(lockBase)) continue;
    for (const manifest of manifests) {
      if (!preset.manifests.includes(baseNameOf(manifest))) continue;
      if (isAtOrBelow(folderOf(manifest), lockFolder)) return true;
    }
  }
  return false;
}
