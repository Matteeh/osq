/**
 * Files outside the specs that name a capability.
 *
 * The generated-move proposal lists every project file that mentions the old
 * capability as a whole word, so a planner knows which files to rewrite. The
 * scan is read-only: it never changes a file it visits.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';

/** Directories the scan never descends into. */
const OMITTED_DIRS = new Set(['node_modules', 'dist']);

/** A whole-word match for the capability: no letter, digit, `_` or `-` beside it. */
function namingPattern(capability: string): RegExp {
  const escaped = capability.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`);
}

/** Read a file as text, or null when it holds a NUL byte or cannot be read. */
async function readTextFile(filePath: string): Promise<string | null> {
  const bytes = await fs.readFile(filePath).catch(() => null);
  if (bytes === null || bytes.includes(0)) {
    return null;
  }
  return bytes.toString('utf8');
}

/**
 * Every project file, relative to the project root and sorted, that holds
 * `capability` with no letter, digit, `_` or `-` directly before or after it.
 * Files holding a NUL byte, the OpenSpec root, and directories named
 * `node_modules`, `dist` or starting with `.` are left out.
 *
 * @scenario spec-lint-and-approve: Files that name the capability
 * @adr 016
 */
export async function findNamingFiles(
  projectRoot: string,
  config: OsqConfig,
  capability: string,
): Promise<string[]> {
  const root = path.resolve(projectRoot);
  const openspecRoot = path.resolve(root, config.paths.openspecRoot);
  const pattern = namingPattern(capability);
  const found: string[] = [];

  const walk = async (dir: string): Promise<void> => {
    let entries: Dirent[] = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (OMITTED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        if (path.resolve(full) === openspecRoot) continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const text = await readTextFile(full);
      if (text === null || !pattern.test(text)) continue;
      found.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };

  await walk(root);
  return found.sort();
}
