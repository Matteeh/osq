import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import {
  type ChangeTree,
  type LocatedChange,
  changeTrees,
  findChange,
} from '../status/change-locations.js';

/** One change folder's text files, keyed by `/`-separated relative path. */
export interface ChangeFiles {
  readonly folder: string;
  readonly files: Record<string, string>;
}

/** One upload's outcome: the folder name and how many files were written. */
export interface ChangeUpload {
  readonly folder: string;
  readonly files: number;
}

/** A refused file request with the HTTP status and JSON error. */
export interface FilesFailure {
  readonly status: number;
  readonly error: string;
}

export type FilesOutcome<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: FilesFailure };

function failed<T>(status: number, error: string): FilesOutcome<T> {
  return { ok: false, failure: { status, error } };
}

/** Whether a path stays inside the change folder and avoids `.run`. */
function isInsideFolder(rel: string): boolean {
  if (rel.length === 0 || rel.includes('\0') || rel.includes('\\')) return false;
  if (rel.startsWith('/') || path.isAbsolute(rel)) return false;
  const segments = rel.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return false;
  }
  return segments[0] !== '.run';
}

/** The change is unapproved and lives in the first tree `changeTrees` returns. */
async function ownsChange(change: LocatedChange, ownTree: ChangeTree): Promise<boolean> {
  if (change.tree.root !== ownTree.root) return false;
  const approved = await fs
    .stat(path.join(change.folderPath, '.run', 'approved'))
    .catch(() => null);
  return approved === null;
}

async function resolveChange(
  projectRoot: string,
  config: OsqConfig,
  selector: string,
): Promise<FilesOutcome<LocatedChange>> {
  let change: LocatedChange;
  try {
    change = await findChange(projectRoot, config, selector);
  } catch {
    return failed(404, `change ${selector} not found`);
  }
  const [ownTree] = await changeTrees(projectRoot, config);
  if (ownTree === undefined || !(await ownsChange(change, ownTree))) {
    return failed(
      409,
      `change ${change.folderName} is approved; only an unapproved change's files move`,
    );
  }
  return { ok: true, value: change };
}

async function collectFiles(folderPath: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (prefix === '' && entry.name === '.run') continue;
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, rel);
      else if (entry.isFile()) files[rel] = await fs.readFile(full, 'utf8');
    }
  };
  await walk(folderPath, '');
  return files;
}

/**
 * Read every text file an unapproved change folder holds, except `.run/`.
 * @scenario web-inspection: Download a change folder
 * @scenario web-inspection: Approved change refused
 * @adr 013
 */
export async function readChangeFiles(
  projectRoot: string,
  config: OsqConfig,
  selector: string,
): Promise<FilesOutcome<ChangeFiles>> {
  const resolved = await resolveChange(projectRoot, config, selector);
  if (!resolved.ok) return resolved;
  const change = resolved.value;
  const files = await collectFiles(change.folderPath);
  return { ok: true, value: { folder: change.folderName, files } };
}

/** Remove every entry of the change folder except the `.run/` folder. */
async function clearFolder(folderPath: string): Promise<void> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.run') continue;
    await fs.rm(path.join(folderPath, entry.name), { recursive: true, force: true });
  }
}

/** Write each uploaded text file, creating the folders it needs. */
async function writeFiles(folderPath: string, files: Record<string, string>): Promise<void> {
  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(folderPath, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, text, 'utf8');
  }
}

/**
 * Replace an unapproved change folder's files with the uploaded text files,
 * leaving `.run/` untouched, after checking every path and the change.
 * @scenario web-inspection: Upload replaces the folder
 * @scenario web-inspection: Upload refused outside the change folder
 * @scenario web-inspection: Approved change refused
 * @adr 013
 */
export async function replaceChangeFiles(
  projectRoot: string,
  config: OsqConfig,
  selector: string,
  files: Record<string, string>,
): Promise<FilesOutcome<ChangeUpload>> {
  const invalid = Object.keys(files).find((rel) => !isInsideFolder(rel));
  if (invalid !== undefined) return failed(400, `path outside the change folder: ${invalid}`);
  const resolved = await resolveChange(projectRoot, config, selector);
  if (!resolved.ok) return resolved;
  const change = resolved.value;
  await clearFolder(change.folderPath);
  await writeFiles(change.folderPath, files);
  return { ok: true, value: { folder: change.folderName, files: Object.keys(files).length } };
}
