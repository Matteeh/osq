import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { parseSpecMd } from '../core/parser.js';
import { deriveSpecState } from '../core/state.js';

export async function applyDelta(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<void> {
  const specMdPath = path.join(specFolderPath, 'spec.md');
  let specContent = '';
  try {
    specContent = await fs.readFile(specMdPath, 'utf8');
  } catch {
    return;
  }

  const specData = parseSpecMd(specContent);
  if (!specData.delta.trim() || specData.features.writes.length === 0) {
    return;
  }

  const featuresDir = path.join(projectRoot, config.paths.features);
  await fs.mkdir(featuresDir, { recursive: true });

  for (const featureName of specData.features.writes) {
    const featurePath = path.join(featuresDir, `${featureName}.md`);
    let existing = '';
    try {
      existing = await fs.readFile(featurePath, 'utf8');
    } catch {}

    let updatedContent = '';
    if (!existing.trim()) {
      const titleWords = featureName
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      updatedContent = `# ${titleWords}\n\n${specData.delta}\n`;
    } else {
      updatedContent = `${existing.trim()}\n\n## Delta from ${specData.title}\n\n${specData.delta}\n`;
    }

    await fs.writeFile(featurePath, updatedContent, 'utf8');
  }
}

export async function archiveSpecFolder(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<string> {
  const archiveDir = path.join(projectRoot, config.paths.archive);
  await fs.mkdir(archiveDir, { recursive: true });

  const folderName = path.basename(specFolderPath);
  const targetPath = path.join(archiveDir, folderName);

  try {
    await fs.rm(targetPath, { recursive: true, force: true });
  } catch {}

  await fs.rename(specFolderPath, targetPath);
  return targetPath;
}

export async function checkAndArchiveSpec(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<boolean> {
  const specState = await deriveSpecState(projectRoot, specFolderPath);
  if (specState.status !== 'done') {
    return false;
  }

  await applyDelta(projectRoot, specFolderPath, config);
  await archiveSpecFolder(projectRoot, specFolderPath, config);
  return true;
}
