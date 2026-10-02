import fs from 'node:fs/promises';
import path from 'node:path';

/** Recursively collect every non-declaration TypeScript file under `dir`. */
async function listSourceFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listSourceFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Normalize a relative path to forward slashes. */
function toPosix(relative: string): string {
  return relative.split(path.sep).join('/');
}

/** The path shown in a message, relative to the parent of `sourceDir`. */
function displayPath(sourceDir: string, target: string): string {
  return toPosix(path.relative(path.dirname(sourceDir), target));
}

/**
 * Check every `.ts` file under `sourceDir` against `maxLines`.
 *
 * Lines are counted as `source.split('\n').length`. A file is exempt only when
 * its path relative to `sourceDir` is in `allowList`. The returned messages
 * name an unlisted file over the limit, a listed path whose file is back
 * within the limit, or a listed path with no matching file. Message paths are
 * relative to the parent of `sourceDir`, so calling this on `src/` names files
 * from the repository root.
 */
export async function checkLineBudget(
  sourceDir: string,
  allowList: Iterable<string>,
  maxLines: number,
): Promise<string[]> {
  const allowed = new Set(allowList);
  const files = await listSourceFiles(sourceDir);
  const violations: string[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const relative = toPosix(path.relative(sourceDir, file));
    const lineCount = (await fs.readFile(file, 'utf8')).split('\n').length;
    const shown = displayPath(sourceDir, file);
    if (allowed.has(relative)) {
      seen.add(relative);
      if (lineCount <= maxLines) {
        violations.push(
          `${shown} has ${lineCount} lines, within the ${maxLines}-line budget; remove it from the allow list`,
        );
      }
    } else if (lineCount > maxLines) {
      violations.push(`${shown} has ${lineCount} lines (max ${maxLines})`);
    }
  }

  for (const entry of allowed) {
    if (!seen.has(entry)) {
      violations.push(`${displayPath(sourceDir, path.join(sourceDir, entry))} no longer exists`);
    }
  }

  return violations;
}
