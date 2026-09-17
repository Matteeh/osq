import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

async function collectFiles(dir: string, baseDir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === '.run' || entry.name === '.git' || entry.name === '.DS_Store') {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectFiles(fullPath, baseDir);
      files.push(...nested);
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
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
