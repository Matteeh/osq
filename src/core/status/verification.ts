import fs from 'node:fs/promises';
import path from 'node:path';
import type { VerificationRequirement } from '../spec/human-steps.js';
import { parseSpecMdFromFolder } from '../spec/parser.js';
import { compareNumericPrefix } from './state.js';

/** A human-recorded verification outcome. */
export type VerificationOutcome = 'passed' | 'failed';

/** Derived verification state for one archived change folder. */
export interface VerificationState {
  readonly required: boolean;
  readonly afterLanding: boolean;
  readonly check: string | null;
  readonly outcome: VerificationOutcome | null;
  readonly checkRanSinceArchive: boolean;
}

/** One archived change awaiting a verification outcome. */
export interface PendingVerification {
  readonly folderName: string;
  readonly folderPath: string;
  readonly title: string;
  readonly verification: VerificationState;
}

interface RawEvent {
  readonly type?: unknown;
  readonly data?: unknown;
}

const EMPTY: VerificationState = {
  required: false,
  afterLanding: false,
  check: null,
  outcome: null,
  checkRanSinceArchive: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Parse append-only jsonl, skipping blank and malformed lines. */
function parseEventLines(content: string): RawEvent[] {
  const events: RawEvent[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed !== null && typeof parsed === 'object') events.push(parsed as RawEvent);
    } catch {}
  }
  return events;
}

function readRequirement(value: unknown): VerificationRequirement | null {
  const record = asRecord(value);
  if (!record || typeof record.afterLanding !== 'boolean') return null;
  const check = record.check;
  if (check !== null && typeof check !== 'string') return null;
  return { afterLanding: record.afterLanding, check: check ?? null };
}

async function readArchivedTitle(folderPath: string, fallback: string): Promise<string> {
  const spec = await parseSpecMdFromFolder(folderPath).catch(() => null);
  return spec?.title || fallback;
}

/**
 * Read an archived change's verification state from its change-level event
 * stream. The latest `archived` event decides whether verification is required;
 * the latest `verification_recorded` event supplies the outcome; a check counts
 * only when it follows the archive event.
 */
export async function readVerification(folderPath: string): Promise<VerificationState> {
  const content = await fs
    .readFile(path.join(folderPath, '.run', 'events', 'change.jsonl'), 'utf8')
    .catch(() => null);
  if (content === null) return EMPTY;

  const events = parseEventLines(content);
  let requirement: VerificationRequirement | null = null;
  let archivedIndex = -1;
  let outcome: VerificationOutcome | null = null;

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (event.type === 'archived') {
      requirement = readRequirement(asRecord(event.data)?.verification);
      archivedIndex = index;
    } else if (event.type === 'verification_recorded') {
      const value = asRecord(event.data)?.outcome;
      if (value === 'passed' || value === 'failed') outcome = value;
    }
  }

  return {
    required: requirement !== null,
    afterLanding: requirement?.afterLanding ?? false,
    check: requirement?.check ?? null,
    outcome,
    checkRanSinceArchive: events.some(
      (event, index) => index > archivedIndex && event.type === 'check_ran',
    ),
  };
}

/** Every archived change that requires verification and is not passed. */
export async function listPendingVerifications(archiveDir: string): Promise<PendingVerification[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(archiveDir);
  } catch {
    return [];
  }

  const folders: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('.') || entry.startsWith('_')) continue;
    const stat = await fs.stat(path.join(archiveDir, entry)).catch(() => null);
    if (stat?.isDirectory()) folders.push(entry);
  }
  folders.sort(compareNumericPrefix);

  const pending: PendingVerification[] = [];
  for (const folderName of folders) {
    const folderPath = path.join(archiveDir, folderName);
    const verification = await readVerification(folderPath);
    if (!verification.required || verification.outcome === 'passed') continue;
    const title = await readArchivedTitle(folderPath, folderName);
    pending.push({ folderName, folderPath, title, verification });
  }
  return pending;
}
