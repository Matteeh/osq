import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { applyOpenSpecDeltas } from '../core/spec/apply-deltas.js';
import { getSpecsDir } from '../core/status/layout.js';
import { applyArchiveSidecars } from './archive-sidecars.js';

/** The two living files recorded for every capability the change writes. */
const RECORDED_FILES = ['spec.md', 'osq.yml'] as const;

/** Absolute path of the transient archive record inside a change folder. */
export function archiveSpecsRecordPath(specFolderPath: string): string {
  return path.join(specFolderPath, '.run', 'archive-specs.json');
}

/** Every capability folder under the change's `specs/`, sorted. */
async function deltaCapabilities(specFolderPath: string): Promise<string[]> {
  const entries = await fs
    .readdir(path.join(specFolderPath, 'specs'), { withFileTypes: true })
    .catch((): Dirent[] => []);
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** A project-relative POSIX path. */
function relativePath(projectRoot: string, absolutePath: string): string {
  return path.relative(projectRoot, absolutePath).split(path.sep).join('/');
}

/**
 * Record the living files the change is about to overwrite, then apply the
 * change's deltas and sidecars. The record lets `restoreArchiveSpecs` put every
 * file back byte for byte after a red or interrupted change-level verify.
 */
export async function applyArchiveSpecs(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<void> {
  const specsRoot = getSpecsDir(config.paths.openspecRoot, projectRoot);
  const record: Record<string, string | null> = {};

  for (const capability of await deltaCapabilities(specFolderPath)) {
    for (const name of RECORDED_FILES) {
      const absolutePath = path.join(specsRoot, capability, name);
      record[relativePath(projectRoot, absolutePath)] = await fs
        .readFile(absolutePath, 'utf8')
        .catch(() => null);
    }
  }

  await fs.mkdir(path.join(specFolderPath, '.run'), { recursive: true });
  await fs.writeFile(archiveSpecsRecordPath(specFolderPath), JSON.stringify(record), 'utf8');

  await applyOpenSpecDeltas(projectRoot, specFolderPath, config);
  await applyArchiveSidecars(projectRoot, specFolderPath, config);
}

/** Remove one now-empty directory, leaving a populated one alone. */
async function removeEmptyDir(dir: string): Promise<void> {
  await fs.rmdir(dir).catch(() => {});
}

/**
 * Put every recorded living file back, remove a capability folder the change
 * left empty, and delete the record. Resolves to whether a record existed;
 * without one it changes nothing.
 */
export async function restoreArchiveSpecs(
  projectRoot: string,
  specFolderPath: string,
): Promise<boolean> {
  const recordPath = archiveSpecsRecordPath(specFolderPath);
  const raw = await fs.readFile(recordPath, 'utf8').catch(() => null);
  if (raw === null) {
    return false;
  }

  let record: Record<string, string | null> = {};
  try {
    record = JSON.parse(raw) as Record<string, string | null>;
  } catch {
    record = {};
  }

  for (const [relative, content] of Object.entries(record)) {
    const absolutePath = path.join(projectRoot, relative);
    if (content === null) {
      await fs.rm(absolutePath, { force: true });
      await removeEmptyDir(path.dirname(absolutePath));
    } else {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, 'utf8');
    }
  }

  await fs.rm(recordPath, { force: true });
  return true;
}
