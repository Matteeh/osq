import fs from 'node:fs/promises';
import path from 'node:path';
import { readPlanningSessions } from '../report/planning.js';
import { readManifestApprovedAt } from '../run/manifest-approval.js';
import { parseFrontmatter, resolveChangeDoc } from '../spec/parser.js';

/** Recorded brief metadata: nullable planner, creation date, and body. */
export interface BriefMetadata {
  readonly planner: string | null;
  readonly date: string | null;
  readonly body: string | null;
}

/** Recorded manifest lifecycle metadata. */
export interface ManifestMetadata {
  readonly createdAt: string | null;
  readonly approvedAt: string | null;
  readonly planner: string | null;
}

/** A recorded rejection, from the typed event or its preserved marker. */
export interface RejectionMetadata {
  readonly reason: string;
  readonly timestamp: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function trimmedOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Reads `brief.md`, returning nullable planner, date, and body. */
export async function readBriefMetadata(folderPath: string): Promise<BriefMetadata> {
  const content = await fs.readFile(path.join(folderPath, 'brief.md'), 'utf8').catch(() => null);
  if (content === null) return { planner: null, date: null, body: null };
  const { data, body } = parseFrontmatter(content);
  return {
    planner: trimmedOrNull(data.planner),
    date: validIso(data.date) ?? trimmedOrNull(data.date),
    body,
  };
}

/** Reads `.run/manifest.json`, tolerating absence and malformed JSON. */
export async function readManifestMetadata(folderPath: string): Promise<ManifestMetadata | null> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'manifest.json'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const record = asRecord(parsed);
  if (!record) return null;
  return {
    createdAt: validIso(record.createdAt),
    approvedAt: await readManifestApprovedAt(folderPath),
    planner: trimmedOrNull(record.planner),
  };
}

/** Change-creation time: brief date first, then manifest creation, else null. */
export async function readCreatedAt(
  brief: BriefMetadata,
  manifest: ManifestMetadata | null,
): Promise<string | null> {
  return brief.date ?? manifest?.createdAt ?? null;
}

/** Approval time from the manifest, or null when unreported. */
export async function readApprovedAt(manifest: ManifestMetadata | null): Promise<string | null> {
  return manifest?.approvedAt ?? null;
}

/** Planner attribution from the manifest, then the brief, else null. */
export async function readPlannerAttribution(
  brief: BriefMetadata,
  manifest: ManifestMetadata | null,
): Promise<string | null> {
  return manifest?.planner ?? brief.planner ?? null;
}

/** Authoritative archive time from the change-level `archived` event. */
export async function readLandedAt(folderPath: string): Promise<string | null> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => null);
  if (content === null) return null;
  let found: string | null = null;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const event = asRecord(JSON.parse(line));
      if (event?.type !== 'archived') continue;
      const timestamp = validIso(event.timestamp);
      if (timestamp) found = timestamp;
    } catch {}
  }
  return found;
}

/**
 * Rejection metadata from the typed `rejected` event, falling back to the
 * preserved `.run/rejected.md` marker. A missing reason or timestamp is null.
 */
export async function readRejection(folderPath: string): Promise<RejectionMetadata | null> {
  const eventsContent = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => null);
  if (eventsContent !== null) {
    for (const line of eventsContent.split('\n')) {
      if (!line.trim()) continue;
      try {
        const event = asRecord(JSON.parse(line));
        if (event?.type !== 'rejected') continue;
        const data = asRecord(event.data) ?? {};
        const reason = trimmedOrNull(data.reason);
        const timestamp = validIso(data.timestamp) ?? validIso(event.timestamp);
        if (reason && timestamp) return { reason, timestamp };
      } catch {}
    }
  }

  const marker = await fs
    .readFile(path.join(folderPath, '.run', 'rejected.md'), 'utf8')
    .catch(() => null);
  if (marker === null) return null;
  const { data } = parseFrontmatter(marker);
  const reason = trimmedOrNull(data.reason);
  const timestamp = validIso(data.timestamp);
  return reason && timestamp ? { reason, timestamp } : null;
}

/** Delta capability folders under `<change>/specs`, sorted and deduplicated. */
export async function listDeltaCapabilities(folderPath: string): Promise<string[]> {
  const deltasDir = path.join(folderPath, 'specs');
  const entries = await fs.readdir(deltasDir, { withFileTypes: true }).catch(() => []);
  return [
    ...new Set(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)),
  ].sort();
}

/** Number of parseable `tasks/<n>.md` files in one change folder. */
export async function countTasks(folderPath: string): Promise<number> {
  const entries = await fs.readdir(path.join(folderPath, 'tasks')).catch(() => []);
  return entries.filter((entry) => entry.endsWith('.md')).length;
}

/** Resolvable change-document presence, used to reject non-change folders. */
export async function hasChangeDocument(folderPath: string): Promise<boolean> {
  return (await resolveChangeDoc(folderPath)) !== null;
}

export { readPlanningSessions };
