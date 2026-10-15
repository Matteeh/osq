/**
 * The automatic steering record: `.run/auto-steer.md` in a change folder. The
 * watcher writes it before it spawns the steering planner and again with the
 * outcome, so one run per trigger is visible from the filesystem alone. The
 * frontmatter holds the trigger key, the outcome, the changed plan files and
 * the time; the body holds the failure output or the lint errors.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseFrontmatter } from '../spec/parser.js';
import { type SteeringTrigger, describeTrigger, steeringMarkerPath } from '../status/steering.js';

/** The outcome of one automatic steering run. */
export type AutoSteerOutcome =
  | 'running'
  | 'ready'
  | 'unchanged'
  | 'lint_red'
  | 'failed'
  | 'timed_out';

/** One `.run/auto-steer.md` record. */
export interface AutoSteerRecord {
  readonly key: string;
  readonly outcome: AutoSteerOutcome;
  /** Change-folder-relative POSIX paths the planner added, changed or removed. */
  readonly changed: readonly string[];
  /** ISO time the record was written. */
  readonly at: string;
  /** The process running the planner, while the outcome is `running`. */
  readonly pid?: number;
  /** Body text: failure output or one `- <error>` line per lint error. */
  readonly detail?: string;
}

/** State `currentAutoSteer` reads; a `SpecState` fits. */
export interface AutoSteerState {
  readonly folderPath: string;
  readonly approvedHash: string | null;
  readonly steering?: readonly SteeringTrigger[];
}

const OUTCOMES: ReadonlySet<string> = new Set([
  'running',
  'ready',
  'unchanged',
  'lint_red',
  'failed',
  'timed_out',
]);

/**
 * `<changeFolder>/.run/auto-steer.md`.
 *
 * @scenario watcher-and-harness: Stale record
 * @adr 018
 */
export function autoSteerRecordPath(folderPath: string): string {
  return path.join(folderPath, '.run', 'auto-steer.md');
}

async function markerBytes(folderPath: string, trigger: SteeringTrigger): Promise<Buffer> {
  return fs.readFile(steeringMarkerPath(folderPath, trigger)).catch(() => Buffer.alloc(0));
}

/**
 * The trigger key: `sha256:` and the hex SHA-256 over the approved hash and,
 * for each trigger in order, its `describeTrigger` text and its marker bytes.
 *
 * @scenario watcher-and-harness: Key follows the trigger
 * @adr 018
 */
export async function steeringKey(
  folderPath: string,
  approvedHash: string,
  triggers: readonly SteeringTrigger[],
): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(approvedHash, 'utf8');
  for (const trigger of triggers) {
    hash.update(describeTrigger(trigger), 'utf8');
    hash.update(await markerBytes(folderPath, trigger));
  }
  return `sha256:${hash.digest('hex')}`;
}

function parseRecord(content: string): AutoSteerRecord | null {
  const { data, body } = parseFrontmatter(content);
  const { key, outcome, changed, at } = data;
  if (typeof key !== 'string' || typeof outcome !== 'string' || !OUTCOMES.has(outcome)) {
    return null;
  }
  if (!Array.isArray(changed) || changed.some((entry) => typeof entry !== 'string')) {
    return null;
  }
  if (typeof at !== 'string') return null;
  const pid = typeof data.pid === 'number' ? data.pid : undefined;
  const detail = body.trim().length > 0 ? body.replace(/\n$/, '') : undefined;
  return {
    key,
    outcome: outcome as AutoSteerOutcome,
    changed: [...changed],
    at,
    ...(pid !== undefined ? { pid } : {}),
    ...(detail !== undefined ? { detail } : {}),
  };
}

/**
 * Read `.run/auto-steer.md`; null for a missing or malformed file.
 *
 * @scenario watcher-and-harness: Stale record
 * @scenario watcher-and-harness: Running record names its process
 * @scenario watcher-and-harness: Planner running elsewhere
 * @adr 018
 */
export async function readAutoSteerRecord(folderPath: string): Promise<AutoSteerRecord | null> {
  const content = await fs.readFile(autoSteerRecordPath(folderPath), 'utf8').catch(() => null);
  return content === null ? null : parseRecord(content);
}

/**
 * Write `.run/auto-steer.md`, creating `.run/` when needed.
 *
 * @scenario watcher-and-harness: Interrupted run
 * @scenario watcher-and-harness: Running record names its process
 * @adr 018
 */
export async function writeAutoSteerRecord(
  folderPath: string,
  record: AutoSteerRecord,
): Promise<void> {
  const frontmatter = YAML.stringify({
    key: record.key,
    outcome: record.outcome,
    changed: [...record.changed],
    at: record.at,
    ...(record.pid !== undefined ? { pid: record.pid } : {}),
  }).trimEnd();
  const detail = record.detail ?? '';
  const body = detail.length > 0 && !detail.endsWith('\n') ? `${detail}\n` : detail;
  const content = `---\n${frontmatter}\n---\n${body.length > 0 ? `${body}` : ''}`;
  await fs.mkdir(path.dirname(autoSteerRecordPath(folderPath)), { recursive: true });
  await fs.writeFile(autoSteerRecordPath(folderPath), content, 'utf8');
}

/**
 * The record only when the state is approved, has steering, and the record's
 * key equals the state's current key; otherwise null.
 *
 * @scenario watcher-and-harness: Stale record
 * @adr 018
 */
export async function currentAutoSteer(state: AutoSteerState): Promise<AutoSteerRecord | null> {
  const triggers = state.steering ?? [];
  if (state.approvedHash === null || triggers.length === 0) return null;
  const record = await readAutoSteerRecord(state.folderPath);
  if (record === null) return null;
  const key = await steeringKey(state.folderPath, state.approvedHash, triggers);
  return record.key === key ? record : null;
}
