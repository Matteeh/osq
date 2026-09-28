import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../foundation/config.js';
import { mergeDelta, parseDelta } from './delta.js';

function resolveOpenSpecRoot(config: OsqConfig): string {
  const paths = config.paths as OsqConfig['paths'] & { readonly openspecRoot?: string };
  return paths.openspecRoot ?? 'openspec';
}

/** Merge every delta spec into `openspec/specs/`. */
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
