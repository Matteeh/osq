import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from './config.js';
import { hashChangeFolder } from './hasher.js';
import { getChangesDir } from './layout.js';
import { lintChangeFolder } from './linter.js';

export async function findSpecFolder(specsDir: string, idOrPrefix: string): Promise<string> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(specsDir);
  } catch {
    throw new Error(`Specs directory not found at ${specsDir}`);
  }

  const trimmed = idOrPrefix.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;

  for (const entry of entries) {
    if (
      entry === trimmed ||
      entry === padded ||
      entry.startsWith(`${trimmed}-`) ||
      entry.startsWith(`${padded}-`)
    ) {
      const fullPath = path.join(specsDir, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        return fullPath;
      }
    }
  }

  throw new Error(`Spec "${idOrPrefix}" not found in ${specsDir}`);
}

export interface ApproveResult {
  specId: string;
  folderName: string;
  folderPath: string;
  hash: string;
  warnings: string[];
}

export async function approveSpec(
  projectRoot: string,
  specIdOrPrefix: string,
  config: OsqConfig,
): Promise<ApproveResult> {
  const specsDir = getChangesDir(config.paths.openspecRoot, projectRoot);
  const folderPath = await findSpecFolder(specsDir, specIdOrPrefix);
  const folderName = path.basename(folderPath);
  const specId = folderName.match(/^(\d+)/)?.[1] || folderName;

  const lintResult = await lintChangeFolder(projectRoot, folderPath, config);
  if (!lintResult.valid) {
    throw new Error(
      `Lint failed for spec "${folderName}":\n  - ${lintResult.errors.join('\n  - ')}`,
    );
  }

  const hash = await hashChangeFolder(folderPath);

  const runDir = path.join(folderPath, '.run');
  await fs.mkdir(runDir, { recursive: true });

  const approvedPath = path.join(runDir, 'approved');
  await fs.writeFile(approvedPath, `${hash}\n`, 'utf8');

  return {
    specId,
    folderName,
    folderPath,
    hash,
    warnings: lintResult.warnings,
  };
}
