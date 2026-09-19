import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from './config.js';
import { hashChangeFolder } from './hasher.js';
import { getChangesDir } from './layout.js';
import { lintChangeFolder } from './linter.js';
import { buildManifest, writeManifest } from './manifest.js';

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

/**
 * Rename active `.run/dead/<n>.md` markers to `dead/<n>.<attempt>.md` so a
 * re-approved change preserves prior failure diagnostics. `<attempt>` is one
 * past the highest existing attempt, or 1 when no prior attempts exist.
 */
async function retainDeadMarkers(runDir: string): Promise<void> {
  const deadDir = path.join(runDir, 'dead');
  let entries: string[];
  try {
    entries = await fs.readdir(deadDir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const active = entry.match(/^(\d+)\.md$/);
    if (!active) continue;

    const taskNumber = active[1];
    const attemptPattern = new RegExp(`^${taskNumber}\\.(\\d+)\\.md$`);
    const attempts = entries
      .map((name) => name.match(attemptPattern))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => Number.parseInt(match[1], 10));
    const nextAttempt = attempts.length === 0 ? 1 : Math.max(...attempts) + 1;

    await fs.rename(
      path.join(deadDir, entry),
      path.join(deadDir, `${taskNumber}.${nextAttempt}.md`),
    );
  }
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
  await retainDeadMarkers(runDir);

  const approvedPath = path.join(runDir, 'approved');
  await fs.writeFile(approvedPath, `${hash}\n`, 'utf8');

  const manifest = await buildManifest(projectRoot, folderPath, config);
  await writeManifest(runDir, manifest);

  return {
    specId,
    folderName,
    folderPath,
    hash,
    warnings: lintResult.warnings,
  };
}
