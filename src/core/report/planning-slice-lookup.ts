import fs from 'node:fs/promises';
import path from 'node:path';
import { readManifestApprovedAt } from '../run/manifest-approval.js';
import { parseFrontmatter } from '../spec/parser.js';
import { getRejectedMarkerPath } from '../status/layout.js';
import { readPlanRecords } from './planning-records.js';
import { validIso } from './planning-slice-turns.js';

/**
 * Approval time recorded for one change and one session: a recorded slice's
 * `approvedAt`, else the change manifest's `approvedAt`, else null. When the
 * folder no longer exists under the changes directory, the same lookup reads
 * its archived or rejected history instead.
 */
export async function resolveChangeApprovalTime(
  changeFolder: string,
  sessionId: string,
  cache: Map<string, string | null> = new Map(),
): Promise<string | null> {
  const key = `${changeFolder}\u0000${sessionId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let approved = await directApproval(changeFolder, sessionId);
  if (approved === null && !(await isDirectory(changeFolder))) {
    approved = await movedApproval(changeFolder, sessionId);
  }
  cache.set(key, approved);
  return approved;
}

/** Recorded slice `approvedAt` for the session inside one folder, if any. */
async function recordedSliceApproval(
  changeFolder: string,
  sessionId: string,
): Promise<string | null> {
  for (const record of await readPlanRecords(changeFolder)) {
    if (record.type !== 'plan_exited' || record.sessionId !== sessionId) continue;
    const recorded = record.data.slice ? validIso(record.data.slice.approvedAt) : null;
    if (recorded !== null) return recorded;
  }
  return null;
}

/** A recorded slice for the session wins over the folder manifest. */
async function directApproval(changeFolder: string, sessionId: string): Promise<string | null> {
  const recorded = await recordedSliceApproval(changeFolder, sessionId);
  if (recorded !== null) return recorded;
  return manifestApproval(changeFolder);
}

/** Trusted manifest approval for one folder, or null. */
async function manifestApproval(changeFolder: string): Promise<string | null> {
  return readManifestApprovedAt(changeFolder);
}

async function isDirectory(target: string): Promise<boolean> {
  return fs.stat(target).then(
    (stat) => stat.isDirectory(),
    () => false,
  );
}

/** Look under `archive/`, then `rejected/`, beside a moved change folder. */
async function movedApproval(changeFolder: string, sessionId: string): Promise<string | null> {
  const changesDir = path.dirname(changeFolder);
  const name = path.basename(changeFolder);
  const archived = await archivedApproval(changesDir, name, sessionId);
  if (archived !== null) return archived;
  return rejectedApproval(changesDir, name, sessionId);
}

interface ArchivedFolder {
  readonly folder: string;
  readonly suffix: number;
}

/** Entries named `name` or `name-<n>`, ordered with the lowest suffix first. */
function archivedFolders(entries: readonly string[], name: string): ArchivedFolder[] {
  const folders: ArchivedFolder[] = [];
  for (const entry of entries) {
    if (entry === name) {
      folders.push({ folder: entry, suffix: 0 });
      continue;
    }
    if (!entry.startsWith(`${name}-`)) continue;
    const suffix = entry.slice(name.length + 1);
    if (!/^\d+$/.test(suffix)) continue;
    folders.push({ folder: entry, suffix: Number.parseInt(suffix, 10) });
  }
  return folders.sort((a, b) => a.suffix - b.suffix || a.folder.localeCompare(b.folder));
}

/** A recorded slice for the session wins, else the highest suffix's manifest. */
async function archivedApproval(
  changesDir: string,
  name: string,
  sessionId: string,
): Promise<string | null> {
  const archiveDir = path.join(changesDir, 'archive');
  const entries = await fs.readdir(archiveDir).catch((): string[] => []);
  const folders: ArchivedFolder[] = [];
  for (const candidate of archivedFolders(entries, name)) {
    const folder = path.join(archiveDir, candidate.folder);
    if (await isDirectory(folder)) folders.push({ folder, suffix: candidate.suffix });
  }
  for (let index = folders.length - 1; index >= 0; index--) {
    const recorded = await recordedSliceApproval(folders[index].folder, sessionId);
    if (recorded !== null) return recorded;
  }
  for (let index = folders.length - 1; index >= 0; index--) {
    const approved = await manifestApproval(folders[index].folder);
    if (approved !== null) return approved;
  }
  return null;
}

/** A recorded slice for the session wins, else `.run/rejected.md` timestamp. */
async function rejectedApproval(
  changesDir: string,
  name: string,
  sessionId: string,
): Promise<string | null> {
  const folder = path.join(changesDir, 'rejected', name);
  if (!(await isDirectory(folder))) return null;
  const recorded = await recordedSliceApproval(folder, sessionId);
  if (recorded !== null) return recorded;
  const content = await fs.readFile(getRejectedMarkerPath(folder), 'utf8').catch(() => null);
  if (content === null) return null;
  const { data } = parseFrontmatter(content);
  const timestamp = typeof data.timestamp === 'string' ? data.timestamp.trim() : null;
  return validIso(timestamp);
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
