import fs from 'node:fs/promises';
import { readManifestObject } from '../report/change-reads.js';
import { getApprovedMarkerPath } from '../status/layout.js';

/**
 * Trusted manifest approval time: the manifest's `approvedAt` counts only when
 * the change folder holds `.run/approved` and the value parses as a date.
 * Records are never rewritten; readers stop trusting an unmarked time.
 */
export async function readManifestApprovedAt(changeFolder: string): Promise<string | null> {
  const marked = await fs.access(getApprovedMarkerPath(changeFolder)).then(
    () => true,
    () => false,
  );
  if (!marked) return null;
  const manifest = await readManifestObject(changeFolder);
  if (manifest === null) return null;
  const value = manifest.approvedAt;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
