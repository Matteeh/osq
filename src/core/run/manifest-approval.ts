import fs from 'node:fs/promises';
import path from 'node:path';
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
  const raw = await fs
    .readFile(path.join(changeFolder, '.run', 'manifest.json'), 'utf8')
    .catch(() => null);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const value =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as { approvedAt?: unknown }).approvedAt
      : null;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}
