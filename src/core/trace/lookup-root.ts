import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Finding the openspec root and, when that root sits in an osq worktree,
 * deriving the worktree's change folder from its branch files. This reads only
 * `.git` and the linked `HEAD`; it never spawns a process.
 */

/** The openspec root and the change folder the lookup should treat as `OSQ_CHANGE`. */
export interface SpecLocation {
  readonly openspecRoot: string;
  readonly changeFolder: string | null;
}

const worktreeFolders = new Map<string, string | null>();

/** Forget every cached worktree read. */
export function clearLookupRootCache(): void {
  worktreeFolders.clear();
}

/** The nearest ancestor of `cwd`, included, that holds `openspec/specs`. */
export function findOpenspecRoot(cwd: string): string {
  const start = path.resolve(cwd);
  let dir = start;
  for (;;) {
    if (existsSync(path.join(dir, 'openspec', 'specs'))) return path.join(dir, 'openspec');
    const parent = path.dirname(dir);
    if (parent === dir) return path.join(start, 'openspec');
    dir = parent;
  }
}

function readText(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function isDirectory(dirPath: string): boolean {
  try {
    return statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

/** The directory after `gitdir:` in a worktree's `.git` file, or null. */
function linkedGitDir(root: string): string | null {
  const text = readText(path.join(root, '.git'));
  if (text === null) return null;
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith('gitdir:'));
  if (line === undefined) return null;
  const value = line.slice('gitdir:'.length).trim();
  if (value === '') return null;
  return path.resolve(root, value);
}

/** The `refs/heads/` branch the linked directory's `HEAD` names, or null. */
function headBranch(gitDir: string): string | null {
  const text = readText(path.join(gitDir, 'HEAD'));
  if (text === null) return null;
  const prefix = 'ref: refs/heads/';
  const head = text.trim();
  if (!head.startsWith(prefix)) return null;
  return head.slice(prefix.length);
}

/** A single active change folder name under `changes/`, or null. */
function activeFolderName(openspecRoot: string, branch: string): string | null {
  const prefix = 'osq/';
  if (!branch.startsWith(prefix)) return null;
  const folder = branch.slice(prefix.length);
  if (folder === '' || folder.includes('/') || folder.includes('\\')) return null;
  if (!isDirectory(path.join(openspecRoot, 'changes', folder))) return null;
  return folder;
}

/** The change folder of the osq worktree holding `openspecRoot`, or null. */
function readWorktreeChangeFolder(openspecRoot: string): string | null {
  const gitDir = linkedGitDir(path.dirname(openspecRoot));
  if (gitDir === null) return null;
  const branch = headBranch(gitDir);
  if (branch === null) return null;
  const folder = activeFolderName(openspecRoot, branch);
  if (folder === null) return null;
  return path.join(openspecRoot, 'changes', folder);
}

/** The worktree's change folder, read at most once per process for `openspecRoot`. */
export function worktreeChangeFolder(openspecRoot: string): string | null {
  const cached = worktreeFolders.get(openspecRoot);
  if (cached !== undefined) return cached;
  const folder = readWorktreeChangeFolder(openspecRoot);
  worktreeFolders.set(openspecRoot, folder);
  return folder;
}
