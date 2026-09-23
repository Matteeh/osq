import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApprovalFlagId } from '../spec/digest.js';
import { parseEventLines } from './report-events.js';

/** The fixed flag ids in the order the digest emits them. */
const FLAG_IDS: readonly ApprovalFlagId[] = [
  'shared_file',
  'sensitive_path',
  'verify_without_test',
  'removed_requirement',
  'unknown_capability',
];

/** The key used for changes whose recorded flag ids are empty. */
export const NO_APPROVAL_FLAGS = 'none';

/** Every reported key, never recomputed: the five flag ids then `none`. */
export const APPROVAL_FLAG_KEYS: readonly string[] = [...FLAG_IDS, NO_APPROVAL_FLAGS];

/** Fired and later-troubled counts for one handling mode. */
export interface ApprovalFlagModeOutcome {
  readonly fired: number;
  readonly troubled: number;
}

/** Shown and confirmed outcomes for one reported key. */
export interface ApprovalFlagOutcome {
  readonly shown: ApprovalFlagModeOutcome;
  readonly confirmed: ApprovalFlagModeOutcome;
}

/** Per-key outcomes plus the number of changes that recorded flags. */
export interface ApprovalFlagOutcomes {
  readonly changes: number;
  readonly byFlag: Record<string, ApprovalFlagOutcome>;
}

interface MutableModeOutcome {
  fired: number;
  troubled: number;
}

interface MutableFlagOutcome {
  shown: MutableModeOutcome;
  confirmed: MutableModeOutcome;
}

/** Recorded approval flags read from a manifest: distinct ids and handling mode. */
interface RecordedFlags {
  readonly ids: readonly string[];
  readonly mode: 'shown' | 'confirmed';
}

function emptyFlagOutcome(): MutableFlagOutcome {
  return {
    shown: { fired: 0, troubled: 0 },
    confirmed: { fired: 0, troubled: 0 },
  };
}

/**
 * The recorded `approvalFlags` of a manifest, or null when the file is
 * malformed or the field is absent or does not carry a valid `ids` array and
 * `shown`/`confirmed` mode.
 */
function parseRecordedFlags(content: string): RecordedFlags | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const flags = (parsed as Record<string, unknown>).approvalFlags;
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return null;
  const record = flags as Record<string, unknown>;
  if (record.mode !== 'shown' && record.mode !== 'confirmed') return null;
  if (!Array.isArray(record.ids)) return null;
  if (!record.ids.every((id) => typeof id === 'string')) return null;
  return { ids: record.ids as string[], mode: record.mode };
}

/** One numbered task stream; `change.jsonl` is the change-level stream. */
function isTaskStream(entry: string): boolean {
  return /^\d+\.jsonl$/.test(entry);
}

/** True when a stream carries trouble: a task `dead` or any kind of `regressed`. */
function streamHasTrouble(entry: string, content: string): boolean {
  const taskStream = isTaskStream(entry);
  return parseEventLines(content).some((event) => {
    if (event.type === 'regressed') return true;
    return taskStream && event.type === 'dead';
  });
}

/**
 * A change has later trouble when any numbered task stream holds a `dead`
 * event, or any task or change stream holds a `regressed` event.
 */
async function changeHasTrouble(folderPath: string): Promise<boolean> {
  const eventsDir = path.join(folderPath, '.run', 'events');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(eventsDir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    if (!isTaskStream(entry) && entry !== 'change.jsonl') continue;
    const content = await fs.readFile(path.join(eventsDir, entry), 'utf8').catch(() => '');
    if (streamHasTrouble(entry, content)) return true;
  }
  return false;
}

/** Every reported key starts at zero so callers never infer an absent key. */
function emptyByFlag(): Record<string, MutableFlagOutcome> {
  const byFlag: Record<string, MutableFlagOutcome> = {};
  for (const key of APPROVAL_FLAG_KEYS) byFlag[key] = emptyFlagOutcome();
  return byFlag;
}

/**
 * Reads recorded `approvalFlags` from every given change folder's manifest and
 * counts, per key and mode, how many changes fired it and how many later had
 * trouble. Folders without a valid recorded field contribute nothing; flags
 * are never recomputed from the authored change.
 */
export async function collectApprovalFlagOutcomes(
  folders: readonly string[],
): Promise<ApprovalFlagOutcomes> {
  const byFlag = emptyByFlag();
  let changes = 0;

  for (const folderPath of folders) {
    const content = await fs
      .readFile(path.join(folderPath, '.run', 'manifest.json'), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    const recorded = parseRecordedFlags(content);
    if (!recorded) continue;

    changes++;
    const troubled = await changeHasTrouble(folderPath);
    const keys = new Set(recorded.ids.length === 0 ? [NO_APPROVAL_FLAGS] : recorded.ids);
    for (const key of keys) {
      const outcome = byFlag[key];
      if (!outcome) continue;
      const bucket = recorded.mode === 'confirmed' ? outcome.confirmed : outcome.shown;
      bucket.fired++;
      if (troubled) bucket.troubled++;
    }
  }

  return { changes, byFlag };
}

/** Render the `Approval flags:` body, one line per key in fixed order. */
export function formatApprovalFlagOutcomes(outcomes: ApprovalFlagOutcomes): string[] {
  const lines = [`  ${outcomes.changes} approved changes recorded flags`];
  for (const key of APPROVAL_FLAG_KEYS) {
    const outcome = outcomes.byFlag[key] ?? emptyFlagOutcome();
    const fired = outcome.shown.fired + outcome.confirmed.fired;
    const troubled = outcome.shown.troubled + outcome.confirmed.troubled;
    lines.push(
      `  ${key}: fired ${fired} (shown ${outcome.shown.fired}, confirmed ${outcome.confirmed.fired}), later trouble ${troubled} (shown ${outcome.shown.troubled}, confirmed ${outcome.confirmed.troubled})`,
    );
  }
  return lines;
}
