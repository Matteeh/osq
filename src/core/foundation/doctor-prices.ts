import { findUnpricedPlanningModels, formatPriceKey } from '../report/planning-price-gaps.js';
import { listChanges } from '../status/change-locations.js';
import type { OsqConfig } from './config.js';
import type { DoctorCheckResult } from './doctor.js';

/** Every active and archived change folder under the canonical layout. */
async function changeFolders(projectRoot: string, config: OsqConfig): Promise<string[]> {
  const changes = await listChanges(projectRoot, config, ['active', 'archived']);
  return changes.map((change) => change.folderPath);
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
