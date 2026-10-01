import { readManifestApprovedAt } from '../run/manifest-approval.js';
import { readManifestObject } from './change-reads.js';

/**
 * Seconds from a manifest `createdAt` marked `createdAtSource: "created"` to a
 * trusted approval time. Null when the creation marker, a valid creation time,
 * or a trusted approval is missing, or when the approval precedes creation.
 */
export async function readBriefToApprovalSeconds(folderPath: string): Promise<number | null> {
  const manifest = await readManifestObject(folderPath);
  if (manifest === null) return null;
  if (manifest.createdAtSource !== 'created') return null;
  if (typeof manifest.createdAt !== 'string') return null;
  const createdMs = Date.parse(manifest.createdAt);
  if (!Number.isFinite(createdMs)) return null;

  const approvedAt = await readManifestApprovedAt(folderPath);
  if (approvedAt === null) return null;
  const approvedMs = Date.parse(approvedAt);
  if (!Number.isFinite(approvedMs)) return null;
  const delta = approvedMs - createdMs;
  if (delta < 0) return null;
  return Math.round(delta / 1000);
}
