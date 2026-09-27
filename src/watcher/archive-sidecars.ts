/**
 * Sidecars written when a change archives. Once `applyOpenSpecDeltas` has
 * merged a change's deltas, a created capability that declared a group gets a
 * fresh `osq.yml`, and every replacement sidecar the change carries overwrites
 * the living one byte for byte. This is the only writer besides
 * `osq migrate sidecars`.
 */

import type { Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OsqConfig } from '../core/foundation/config.js';
import { readCreates } from '../core/spec/capability-relations.js';
import { formatSidecar, livingSidecarPath } from '../core/spec/capability-sidecar.js';
import { parseFrontmatter, parseSpecMdFromFolder } from '../core/spec/parser.js';

async function exists(filePath: string): Promise<boolean> {
  return fs
    .stat(filePath)
    .then(() => true)
    .catch(() => false);
}

/**
 * Write created sidecars, then copy every replacement the change carries.
 * Created entries only land when the capability now has a living spec and its
 * sidecar is absent; a replacement always wins, so it is applied last.
 */
export async function applyArchiveSidecars(
  projectRoot: string,
  specFolderPath: string,
  config: OsqConfig,
): Promise<void> {
  const openspecRoot = config.paths.openspecRoot;
  const specsRoot = path.join(projectRoot, openspecRoot, 'specs');

  const proposal = await parseSpecMdFromFolder(specFolderPath).catch(() => null);
  if (proposal) {
    const creates = readCreates(parseFrontmatter(proposal.raw).data);
    if (!creates.malformed) {
      for (const entry of creates.entries) {
        if (entry.group === null) continue;
        const hasLivingSpec = await exists(path.join(specsRoot, entry.name, 'spec.md'));
        if (!hasLivingSpec) continue;
        const sidecarPath = livingSidecarPath(projectRoot, openspecRoot, entry.name);
        if (await exists(sidecarPath)) continue;
        await fs.mkdir(path.dirname(sidecarPath), { recursive: true });
        await fs.writeFile(sidecarPath, formatSidecar({ group: entry.group }), 'utf8');
      }
    }
  }

  const replacementsDir = path.join(specFolderPath, 'specs');
  const entries = await fs
    .readdir(replacementsDir, { withFileTypes: true })
    .catch((): Dirent[] => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const replacement = await fs
      .readFile(path.join(replacementsDir, entry.name, 'osq.yml'))
      .catch(() => null);
    if (replacement === null) continue;
    const target = livingSidecarPath(projectRoot, openspecRoot, entry.name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, replacement);
  }
}
