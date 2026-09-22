import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Directory or metadata names excluded from every authored-content view of a
 * change folder, at any depth. These mirror the runtime state the engine owns
 * rather than the author's specification.
 */
const CHANGE_FOLDER_EXCLUDED_SEGMENTS = new Set(['.run', '.git', '.DS_Store']);

/**
 * Transient files owned by the engine at a change folder's root only. A nested
 * file with the same name is authored content and stays covered.
 */
const CHANGE_FOLDER_TRANSIENT_FILES = new Set(['plan-prompt.md']);

/**
 * The single root-relative exclusion predicate shared by hashing and linting.
 * `relPath` is a project-folder-relative POSIX path such as `.run/done/1` or
 * `plan-prompt.md`. Nested runtime directories stay excluded, but a transient
 * file is only transient at the change folder root.
 */
export function isExcludedChangePath(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  if (CHANGE_FOLDER_TRANSIENT_FILES.has(normalized)) {
    return true;
  }
  return normalized.split('/').some((segment) => CHANGE_FOLDER_EXCLUDED_SEGMENTS.has(segment));
}

async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
    if (isExcludedChangePath(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      const nested = await collectFiles(fullPath, baseDir);
      files.push(...nested);
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }

  return files;
}

export function normalizeTasksMd(content: string): string {
  const lfContent = content.replace(/\r\n/g, '\n');
  return lfContent.replace(/^(\s*-\s*\[)[xX](\])/gm, (_m, p1, p2) => `${p1} ${p2}`);
}

export async function hashChangeFolder(folderPath: string): Promise<string> {
  const relFiles = await collectFiles(folderPath, folderPath);
  relFiles.sort();

  const hash = crypto.createHash('sha256');

  for (const relFile of relFiles) {
    const fullPath = path.join(folderPath, relFile);
    const content = await fs.readFile(fullPath, 'utf8');
    let normalizedContent = content.replace(/\r\n/g, '\n');

    if (relFile === 'tasks.md') {
      normalizedContent = normalizeTasksMd(normalizedContent);
    }

    hash.update(relFile);
    hash.update('\0');
    hash.update(normalizedContent);
    hash.update('\0');
  }

  return `sha256:${hash.digest('hex')}`;
}

export async function verifyFolderHash(folderPath: string, expectedHash: string): Promise<boolean> {
  const currentHash = await hashChangeFolder(folderPath);
  return currentHash === expectedHash.trim();
}
