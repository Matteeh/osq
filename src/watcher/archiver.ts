import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/config.js';
import { mergeDelta, parseDelta } from '../core/delta.js';
import { getArchiveDir } from '../core/layout.js';
import { parseSpecMdFromFolder } from '../core/parser.js';
import { deriveSpecState } from '../core/state.js';

function resolveOpenSpecRoot(config: OsqConfig): string {
  const paths = config.paths as OsqConfig['paths'] & { readonly openspecRoot?: string };
  return paths.openspecRoot ?? 'openspec';
}

/**
 * Applies every OpenSpec delta spec in `<change>/specs/<capability>/spec.md`
 * into `openspec/specs/<capability>/spec.md` using the deterministic merge
 * engine. No-op when the change carries no delta specs.
 */
export async function applyOpenSpecDeltas(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<void> {
  const deltasDir = path.join(specFolderPath, 'specs');
  const entries = await fs.readdir(deltasDir, { withFileTypes: true }).catch((): Dirent[] => []);
  const capabilities = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (capabilities.length === 0) {
    return;
  }

  const specsRoot = path.join(projectRoot, resolveOpenSpecRoot(config), 'specs');

  for (const capability of capabilities) {
    const deltaPath = path.join(deltasDir, capability, 'spec.md');
    const deltaContent = await fs.readFile(deltaPath, 'utf8').catch(() => null);
    if (deltaContent === null) {
      continue;
    }

    const delta = parseDelta(deltaContent);
    const targetDir = path.join(specsRoot, capability);
    const targetPath = path.join(targetDir, 'spec.md');
    const baseContent = await fs.readFile(targetPath, 'utf8').catch(() => null);
    const merged = mergeDelta(baseContent, capability, delta);

    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, merged, 'utf8');
  }
}

export async function applyDelta(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<void> {
  await applyOpenSpecDeltas(projectRoot, specFolderPath, config);

  const specData = await parseSpecMdFromFolder(specFolderPath);
  if (!specData || !specData.delta.trim() || specData.features.writes.length === 0) {
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

/**
 * Rewrites every unchecked `[ ]` checkbox to `[x]` while preserving bullet
 * style, numbering, and indentation. Purely textual: no `.run/` state is read.
 */
export function tickAllTaskCheckboxes(content: string): string {
  return content.replace(/^([ \t]*[-*][ \t]+\[)[ ](\])/gm, '$1x$2');
}

async function ensureArchivedTasksTicked(folderPath: string): Promise<void> {
  const stack: string[] = [folderPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }

    const entries = await fs.readdir(current, { withFileTypes: true }).catch((): Dirent[] => []);
    for (const entry of entries) {
      if (entry.name === '.run' || entry.name === '.git' || entry.name === '.DS_Store') {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === 'tasks.md') {
        const content = await fs.readFile(fullPath, 'utf8');
        const ticked = tickAllTaskCheckboxes(content);
        if (ticked !== content) {
          await fs.writeFile(fullPath, ticked, 'utf8');
        }
      }
    }
  }
}

/**
 * Applies the change's delta specifications, moves the completed folder to the
 * canonical `<openspecRoot>/changes/archive`, and ensures every archived
 * `tasks.md` is fully ticked so `openspec validate --archived` passes. The whole
 * folder (including `.run/` markers, results, and event logs) moves as one unit.
 */
export async function archiveSpecFolder(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<string> {
  await applyDelta(projectRoot, specFolderPath, config);

  const archiveDir = getArchiveDir(config.paths.openspecRoot, projectRoot);
  await fs.mkdir(archiveDir, { recursive: true });

  const folderName = path.basename(specFolderPath);
  let targetPath = path.join(archiveDir, folderName);

  let counter = 1;
  while (
    await fs
      .stat(targetPath)
      .then(() => true)
      .catch(() => false)
  ) {
    targetPath = path.join(archiveDir, `${folderName}-${counter}`);
    counter++;
  }

  await fs.rename(specFolderPath, targetPath);
  await ensureArchivedTasksTicked(targetPath);
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

  // `archiveSpecFolder` applies deltas exactly once before moving the folder.
  await archiveSpecFolder(projectRoot, specFolderPath, config);
  return true;
}
