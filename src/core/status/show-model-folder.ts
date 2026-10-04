import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { type ChangeLocation, listChanges, locateFolder } from './change-locations.js';

function matchesFolder(folderName: string, query: string): boolean {
  const trimmed = query.trim();
  const num = Number.parseInt(trimmed, 10);
  const padded = !Number.isNaN(num) ? String(num).padStart(3, '0') : trimmed;

  if (folderName === trimmed || folderName === padded) return true;
  if (folderName.startsWith(`${trimmed}-`) || folderName.startsWith(`${padded}-`)) return true;
  if (folderName.endsWith(`-${trimmed}`)) return true;
  return false;
}

/** Resolve an id, prefix, or path to a change folder in the canonical trees. */
export async function resolveSpecFolder(
  projectRoot: string,
  idOrPrefix: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<{
  folderPath: string;
  isArchived: boolean;
  location: 'active' | 'archived' | 'rejected';
}> {
  const trimmed = idOrPrefix.trim();
  if (!trimmed) {
    throw new Error('Spec ID or prefix cannot be empty');
  }

  // If directly pointing to an existing folder
  if (path.isAbsolute(trimmed) || trimmed.includes(path.sep)) {
    const candidatePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectRoot, trimmed);
    const stat = await fs.stat(candidatePath).catch(() => null);
    if (stat?.isDirectory()) {
      const located = await locateFolder(projectRoot, config, candidatePath);
      const location: ChangeLocation = located?.location ?? 'active';
      return { folderPath: candidatePath, isArchived: location === 'archived', location };
    }
  }

  // Search active, then archived, then rejected. The search order and every
  // message stay as before this module took over folder discovery.
  for (const change of await listChanges(projectRoot, config)) {
    if (matchesFolder(change.folderName, trimmed)) {
      return {
        folderPath: change.folderPath,
        isArchived: change.location === 'archived',
        location: change.location,
      };
    }
  }

  throw new Error(`Spec "${idOrPrefix}" not found in specs or archive`);
}
