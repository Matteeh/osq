import fs from 'node:fs/promises';
import path from 'node:path';
import { readPlanRecords } from './planning-records.js';
import { validIso } from './planning-slice-turns.js';

/**
 * Approval time recorded for one change and one session: a recorded slice's
 * `approvedAt`, else the change manifest's `approvedAt`, else null.
 */
export async function resolveChangeApprovalTime(
  changeFolder: string,
  sessionId: string,
  cache: Map<string, string | null> = new Map(),
): Promise<string | null> {
  const key = `${changeFolder}\u0000${sessionId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let approved: string | null = null;
  for (const record of await readPlanRecords(changeFolder)) {
    if (record.type !== 'plan_exited' || record.sessionId !== sessionId) continue;
    const recorded = record.data.slice ? validIso(record.data.slice.approvedAt) : null;
    if (recorded !== null) {
      approved = recorded;
      break;
    }
  }
  if (approved === null) {
    try {
      const raw = await fs.readFile(path.join(changeFolder, '.run', 'manifest.json'), 'utf8');
      const value = (JSON.parse(raw) as { approvedAt?: unknown }).approvedAt;
      approved = validIso(typeof value === 'string' ? value : null);
    } catch {
      approved = null;
    }
  }
  cache.set(key, approved);
  return approved;
}

/**
 * Persisted change creation time: the initial `.run/manifest.json` `createdAt`
 * written with the change, with the folder's valid birth time as fallback.
 */
export async function resolveChangeCreationTime(changeFolder: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(changeFolder, '.run', 'manifest.json'), 'utf8');
    const createdAt = (JSON.parse(raw) as { createdAt?: unknown }).createdAt;
    const valid = validIso(typeof createdAt === 'string' ? createdAt : null);
    if (valid) return valid;
  } catch {
    // Missing or malformed manifest.
  }
  try {
    const stat = await fs.stat(changeFolder);
    const birth = stat.birthtime;
    if (birth && Number.isFinite(birth.getTime()) && birth.getTime() > 0) {
      return birth.toISOString();
    }
  } catch {
    // Unreadable folder.
  }
  return null;
}
