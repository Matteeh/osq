import fs from 'node:fs/promises';
import path from 'node:path';
import { findUnpricedPlanningModels, formatPriceKey } from '../report/planning-price-gaps.js';
import { getArchiveDir, getChangesDir, isActiveChangeFolderName } from '../status/layout.js';
import type { OsqConfig } from './config.js';
import type { DoctorCheckResult } from './doctor.js';

/** Direct child directories of `root` whose name passes `keep`. */
async function subdirectories(root: string, keep: (name: string) => boolean): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && keep(entry.name))
    .map((entry) => path.join(root, entry.name));
}

/** Every active and archived change folder under the canonical layout. */
async function changeFolders(projectRoot: string, config: OsqConfig): Promise<string[]> {
  const active = await subdirectories(
    getChangesDir(config.paths.openspecRoot, projectRoot),
    isActiveChangeFolderName,
  );
  const archived = await subdirectories(
    getArchiveDir(config.paths.openspecRoot, projectRoot),
    (name) => !name.startsWith('_') && !name.startsWith('.'),
  );
  return [...active, ...archived];
}

/**
 * The `planning-prices` warning when some recorded-token planning model has no
 * price entry, otherwise null so the check list stays unchanged.
 */
export async function checkPlanningPrices(
  projectRoot: string,
  config: OsqConfig,
): Promise<DoctorCheckResult | null> {
  const folders = await changeFolders(projectRoot, config);
  const models = await findUnpricedPlanningModels(folders, config.planning?.prices);
  if (models.length === 0) return null;
  const keys = models.map((model) => formatPriceKey(model)).join(', ');
  return {
    name: 'planning-prices',
    ok: true,
    warning: true,
    message: `planning cost stays unreported for ${models.join(', ')}; add ${keys}`,
  };
}
