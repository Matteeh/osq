import fs from 'node:fs/promises';
import path from 'node:path';
import type { ApprovalFlagId } from '../spec/digest.js';
import { type ReworkEntry, changeIdOfFolder } from './record-rework.js';
import { parseEventLines } from './report-events.js';

/** The fixed flag ids in the order the digest emits them. */
const FLAG_IDS: readonly ApprovalFlagId[] = [
  'shared_file',
  'sensitive_path',
  'verify_without_test',
  'removed_requirement',
  'unknown_capability',
  'verify_starts_conflict',
  'adr_departure',
];

/** The key used for changes whose recorded flag ids are empty. */
export const NO_APPROVAL_FLAGS = 'none';

/** Every reported key, never recomputed: the flag ids then `none`. */
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

/** Later trouble of one change, in the fixed `dead`, `regressed`, `rework` order. */
export type TroubleKind = 'dead' | 'regressed' | 'rework';

/** One change that recorded flags and later had trouble. */
export interface TroubledChange {
  readonly change: string;
  readonly flags: readonly string[];
  readonly kinds: readonly TroubleKind[];
  /** Sorted ids of later active/archived changes naming it in `fixes`. */
  readonly fixedBy: readonly string[];
}

/** Per-key outcomes plus the number of changes that recorded flags. */
export interface ApprovalFlagOutcomes {
  readonly changes: number;
  readonly byFlag: Record<string, ApprovalFlagOutcome>;
  readonly troubledChanges: readonly TroubledChange[];
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

/** `dead` and `regressed` trouble recorded in a folder's event streams. */
interface EventTrouble {
  dead: boolean;
  regressed: boolean;
}

/**
 * A change has `dead` trouble when any numbered task stream holds a `dead`
 * event, and `regressed` trouble when any task or change stream holds a
 * `regressed` event.
 */
async function changeEventTrouble(folderPath: string): Promise<EventTrouble> {
  const trouble: EventTrouble = { dead: false, regressed: false };
  const eventsDir = path.join(folderPath, '.run', 'events');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(eventsDir);
  } catch {
    return trouble;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    if (!isTaskStream(entry) && entry !== 'change.jsonl') continue;
    const content = await fs.readFile(path.join(eventsDir, entry), 'utf8').catch(() => '');
    const taskStream = isTaskStream(entry);
    for (const event of parseEventLines(content)) {
      if (event.type === 'regressed') trouble.regressed = true;
      if (taskStream && event.type === 'dead') trouble.dead = true;
    }
  }
  return trouble;
}

/** Trouble kinds for a change, in the fixed `dead`, `regressed`, `rework` order. */
function troubleKinds(trouble: EventTrouble, fixedBy: readonly string[]): TroubleKind[] {
  const kinds: TroubleKind[] = [];
  if (trouble.dead) kinds.push('dead');
  if (trouble.regressed) kinds.push('regressed');
  if (fixedBy.length > 0) kinds.push('rework');
  return kinds;
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
 * trouble. Later trouble is a task `dead`, any `regressed` event, or a later
 * change naming it in `fixes`. Folders without a valid recorded field
 * contribute nothing; flags are never recomputed from the authored change.
 */
export async function collectApprovalFlagOutcomes(
  folders: readonly string[],
  rework: readonly ReworkEntry[],
): Promise<ApprovalFlagOutcomes> {
  const byFlag = emptyByFlag();
  const fixedByChange = new Map<string, readonly string[]>();
  for (const entry of rework) fixedByChange.set(entry.change, entry.fixedBy);
  const troubledChanges: TroubledChange[] = [];
  let changes = 0;

  for (const folderPath of folders) {
    const content = await fs
      .readFile(path.join(folderPath, '.run', 'manifest.json'), 'utf8')
      .catch(() => null);
    if (content === null) continue;
    const recorded = parseRecordedFlags(content);
    if (!recorded) continue;

    changes++;
    const changeId = changeIdOfFolder(folderPath);
    const fixedBy = fixedByChange.get(changeId) ?? [];
    const troubled = troubleKinds(await changeEventTrouble(folderPath), fixedBy);
    const hasTrouble = troubled.length > 0;
    const keys = new Set(recorded.ids.length === 0 ? [NO_APPROVAL_FLAGS] : recorded.ids);
    for (const key of keys) {
      const outcome = byFlag[key];
      if (!outcome) continue;
      const bucket = recorded.mode === 'confirmed' ? outcome.confirmed : outcome.shown;
      bucket.fired++;
      if (hasTrouble) bucket.troubled++;
    }
    if (hasTrouble && recorded.ids.length > 0) {
      troubledChanges.push({
        change: changeId,
        flags: [...recorded.ids],
        kinds: troubled,
        fixedBy: [...fixedBy],
      });
    }
  }

  troubledChanges.sort((a, b) => a.change.localeCompare(b.change));
  return { changes, byFlag, troubledChanges };
}

/** Render one troubled change's line, naming the fixing ids for rework. */
function formatTroubledChange(entry: TroubledChange): string {
  const kinds = entry.kinds.map((kind) =>
    kind === 'rework' ? `rework (fixed by ${entry.fixedBy.join(', ')})` : kind,
  );
  return `  ${entry.change} (${entry.flags.join(', ')}): ${kinds.join(', ')}`;
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
  for (const entry of outcomes.troubledChanges ?? []) {
    lines.push(formatTroubledChange(entry));
  }
  return lines;
}
