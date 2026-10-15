/**
 * The planner run record: `.run/plan-run.md` in a change folder. It is the
 * record of a planner a human started for a change that is not approved, and
 * it names the process while the run is live, so osq can tell a live planner
 * from one whose process is gone. The frontmatter holds the outcome, the
 * changed plan files, the start time while `running` and the end time after,
 * the process id while `running`, and the plan hash once finished; the body
 * holds the failure output or the lint errors.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { hashChangeFolder } from '../spec/hasher.js';
import { parseFrontmatter } from '../spec/parser.js';
import {
  type AutoSteerOutcome,
  type AutoSteerState,
  currentAutoSteer,
} from './auto-steer-record.js';
import { isProcessAlive } from './watch-state.js';

/** One `.run/plan-run.md` record. */
export interface PlanRunRecord {
  readonly outcome: AutoSteerOutcome;
  /** Change-folder-relative POSIX paths the planner added, changed or removed. */
  readonly changed: readonly string[];
  /** ISO time: the start while `running`, else the end. */
  readonly at: string;
  /** The planner process, while the outcome is `running`. */
  readonly pid?: number;
  /** `hashChangeFolder` of the folder, once finished. */
  readonly hash?: string;
  /** Body text: failure output or one `- <error>` line per lint error. */
  readonly detail?: string;
}

/** What `currentPlanRun` returns. */
export interface PlanRunView {
  readonly outcome: AutoSteerOutcome;
  readonly at: string;
  readonly changed: readonly string[];
  /** The record's body, or null. */
  readonly detail: string | null;
}

/** The body `currentPlanRun` gives a `running` record whose process stopped. */
const INTERRUPTED = 'interrupted: the planner process stopped';

const OUTCOMES: ReadonlySet<string> = new Set([
  'running',
  'ready',
  'unchanged',
  'lint_red',
  'failed',
  'timed_out',
]);

/**
 * `<changeFolder>/.run/plan-run.md`.
 *
 * @scenario watcher-and-harness: Live planner
 * @adr 018
 * @adr 019
 */
export function planRunRecordPath(folderPath: string): string {
  return path.join(folderPath, '.run', 'plan-run.md');
}

function parseRecord(content: string): PlanRunRecord | null {
  const { data, body } = parseFrontmatter(content);
  const { outcome, changed, at } = data;
  if (typeof outcome !== 'string' || !OUTCOMES.has(outcome)) return null;
  if (!Array.isArray(changed) || changed.some((entry) => typeof entry !== 'string')) {
    return null;
  }
  if (typeof at !== 'string') return null;
  const pid = typeof data.pid === 'number' ? data.pid : undefined;
  const hash = typeof data.hash === 'string' ? data.hash : undefined;
  const detail = body.trim().length > 0 ? body.replace(/\n$/, '') : undefined;
  return {
    outcome: outcome as AutoSteerOutcome,
    changed: [...changed],
    at,
    ...(pid !== undefined ? { pid } : {}),
    ...(hash !== undefined ? { hash } : {}),
    ...(detail !== undefined ? { detail } : {}),
  };
}

/**
 * Read `.run/plan-run.md`; null for a missing or malformed file.
 *
 * @scenario watcher-and-harness: Live planner
 * @scenario watcher-and-harness: Plan edited after the run
 * @adr 018
 * @adr 019
 */
export async function readPlanRunRecord(folderPath: string): Promise<PlanRunRecord | null> {
  const content = await fs.readFile(planRunRecordPath(folderPath), 'utf8').catch(() => null);
  return content === null ? null : parseRecord(content);
}

/**
 * Write `.run/plan-run.md`, creating `.run/` when needed and leaving out `pid`
 * and `hash` when they are not set.
 *
 * @scenario watcher-and-harness: Live planner
 * @scenario watcher-and-harness: Plan edited after the run
 * @adr 018
 * @adr 019
 */
export async function writePlanRunRecord(folderPath: string, record: PlanRunRecord): Promise<void> {
  const frontmatter = YAML.stringify({
    outcome: record.outcome,
    changed: [...record.changed],
    at: record.at,
    ...(record.pid !== undefined ? { pid: record.pid } : {}),
    ...(record.hash !== undefined ? { hash: record.hash } : {}),
  }).trimEnd();
  const detail = record.detail ?? '';
  const body = detail.length > 0 && !detail.endsWith('\n') ? `${detail}\n` : detail;
  const content = `---\n${frontmatter}\n---\n${body.length > 0 ? `${body}` : ''}`;
  await fs.mkdir(path.dirname(planRunRecordPath(folderPath)), { recursive: true });
  await fs.writeFile(planRunRecordPath(folderPath), content, 'utf8');
}

function viewOf(record: {
  readonly outcome: AutoSteerOutcome;
  readonly at: string;
  readonly changed: readonly string[];
  readonly detail?: string;
}): PlanRunView {
  return {
    outcome: record.outcome,
    at: record.at,
    changed: [...record.changed],
    detail: record.detail ?? null,
  };
}

/**
 * The planner run a change's state carries: from `currentAutoSteer` for an
 * approved change that needs steering, else from `.run/plan-run.md` for a
 * change that is not approved, whose finished record counts only while its
 * `hash` equals `hashChangeFolder` of the folder. A `running` record whose
 * `pid` is missing or dead reads as `failed`, with the file left unchanged.
 *
 * @scenario watcher-and-harness: Live planner
 * @scenario watcher-and-harness: Planner process gone
 * @scenario watcher-and-harness: Plan edited after the run
 * @scenario watcher-and-harness: Steering run is the planner run
 * @adr 018
 * @adr 019
 */
export async function currentPlanRun(state: AutoSteerState): Promise<PlanRunView | null> {
  if (state.approvedHash !== null) {
    if ((state.steering ?? []).length === 0) return null;
    const record = await currentAutoSteer(state);
    return record === null ? null : viewOf(record);
  }
  const record = await readPlanRunRecord(state.folderPath);
  if (record === null) return null;
  if (record.outcome === 'running') {
    if (record.pid !== undefined && isProcessAlive(record.pid)) return viewOf(record);
    return {
      outcome: 'failed',
      at: record.at,
      changed: [...record.changed],
      detail: INTERRUPTED,
    };
  }
  const hash = await hashChangeFolder(state.folderPath);
  if (record.hash !== hash) return null;
  return viewOf(record);
}

/**
 * `{ since }`, the record's `at`, when `currentPlanRun` returns a `running`
 * outcome; else null. Writes nothing.
 *
 * @scenario watcher-and-harness: Live planner
 * @scenario watcher-and-harness: Planner process gone
 * @adr 018
 * @adr 019
 */
export async function readLivePlanner(state: AutoSteerState): Promise<{ since: string } | null> {
  const view = await currentPlanRun(state);
  if (view === null || view.outcome !== 'running') return null;
  return { since: view.at };
}
