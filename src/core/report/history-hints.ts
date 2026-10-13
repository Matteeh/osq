/**
 * The plan prompt's `## What history says` section: counted first-attempt lines
 * over the most recent tasks that ran, read from the `task_outcomes` query
 * table. The numbers only inform; osq never blocks or warns on them.
 * `formatPlanHintSections` also places the recent executor disclosures, so the
 * prompt builder imports one function for both optional sections.
 */

import {
  DEFAULT_PLANNING_CONFIG,
  DEFAULT_PLANNING_HISTORY,
  type PlanningHistoryConfig,
} from '../foundation/config-planning.js';
import type { OsqConfig } from '../foundation/config.js';
import { buildHistoryTables } from './query-tables.js';
import { formatRecentDisclosures } from './recent-disclosures.js';

/** Exact heading of the plan prompt's optional history-hints section. */
export const HISTORY_HINTS_HEADING = '## What history says';

/** One `task_outcomes` row the history counts read. */
export interface HistoryHintRow {
  readonly change: string;
  readonly task: string;
  readonly scopeFiles: number | null;
  readonly verifyKind: string;
  readonly testsModify: number;
  readonly sharesScope: number;
  readonly position: number;
  readonly firstAttempt: number;
  readonly deadReason: string | null;
}

/** Every `task_outcomes` row of a task that ran at least once. */
const OUTCOME_ROWS_SQL =
  'SELECT change, task, scope_files, verify_kind, tests_modify, shares_scope, ' +
  'position, first_attempt, dead_reason FROM task_outcomes WHERE attempts >= 1';

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** One query row as a hint row, or null when its identity is unusable. */
function toHistoryHintRow(raw: Record<string, unknown>): HistoryHintRow | null {
  if (typeof raw.change !== 'string' || typeof raw.task !== 'string') return null;
  return {
    change: raw.change,
    task: raw.task,
    scopeFiles: finiteNumber(raw.scope_files),
    verifyKind: typeof raw.verify_kind === 'string' ? raw.verify_kind : 'other',
    testsModify: finiteNumber(raw.tests_modify) ?? 0,
    sharesScope: finiteNumber(raw.shares_scope) ?? 0,
    position: finiteNumber(raw.position) ?? 0,
    firstAttempt: finiteNumber(raw.first_attempt) ?? 0,
    deadReason: typeof raw.dead_reason === 'string' ? raw.dead_reason : null,
  };
}

/**
 * The `task_outcomes` rows with one or more attempts, read from the in-memory
 * tables of `buildHistoryTables`. The database is closed before this resolves,
 * even when the query throws.
 *
 * @scenario metrics-and-reporting: Counted window
 * @scenario metrics-and-reporting: Too little history
 * @adr 008
 */
export async function readHistoryHintRows(
  projectRoot: string,
  config: OsqConfig,
): Promise<HistoryHintRow[]> {
  const db = await buildHistoryTables(projectRoot, config);
  try {
    const raw = db.prepare(OUTCOME_ROWS_SQL).all() as Record<string, unknown>[];
    return raw.map(toHistoryHintRow).filter((row): row is HistoryHintRow => row !== null);
  } finally {
    db.close();
  }
}

/** Numeric prefix of a change folder, or null when it has none. */
function numericPrefix(name: string): number | null {
  const match = name.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

/** Newest change folder numeric id, then newest task number, first. */
function newestFirst(a: HistoryHintRow, b: HistoryHintRow): number {
  const idA = numericPrefix(a.change);
  const idB = numericPrefix(b.change);
  if (idA !== null && idB !== null && idA !== idB) return idB - idA;
  if (idA !== null && idB === null) return -1;
  if (idA === null && idB !== null) return 1;
  if (idA === null && idB === null) {
    const byChange = b.change.localeCompare(a.change);
    if (byChange !== 0) return byChange;
  }
  const taskA = Number.parseInt(a.task, 10);
  const taskB = Number.parseInt(b.task, 10);
  if (!Number.isNaN(taskA) && !Number.isNaN(taskB) && taskA !== taskB) return taskB - taskA;
  return a.task.localeCompare(b.task);
}

interface Group {
  readonly label: string;
  readonly passed: number;
  readonly tasks: number;
}

/** One group's pass count over the rows it matches. */
function groupOf(
  label: string,
  rows: readonly HistoryHintRow[],
  matches: (row: HistoryHintRow) => boolean,
): Group {
  const matched = rows.filter(matches);
  return {
    label,
    passed: matched.filter((row) => row.firstAttempt === 1).length,
    tasks: matched.length,
  };
}

/** One counted line, or null when no group holds a row. */
function groupsLine(prefix: string, groups: readonly Group[]): string | null {
  const present = groups.filter((group) => group.tasks > 0);
  if (present.length === 0) return null;
  const counts = present.map((group) => `${group.label} ${group.passed}/${group.tasks}`);
  return `${prefix}: ${counts.join(', ')}`;
}

function inRange(files: number | null, low: number, high: number): boolean {
  return files !== null && files >= low && files <= high;
}

/** The four scope-file buckets, null rows in none. */
function scopeGroups(rows: readonly HistoryHintRow[]): Group[] {
  return [
    groupOf('1-2', rows, (row) => inRange(row.scopeFiles, 1, 2)),
    groupOf('3-4', rows, (row) => inRange(row.scopeFiles, 3, 4)),
    groupOf('5-8', rows, (row) => inRange(row.scopeFiles, 5, 8)),
    groupOf('over 8', rows, (row) => inRange(row.scopeFiles, 9, Number.POSITIVE_INFINITY)),
  ];
}

const VERIFY_KINDS = ['one', 'several', 'suite', 'other'] as const;

/** At most three dead reasons, most rows first and then by name. */
function deadReasonLine(rows: readonly HistoryHintRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.deadReason === null || row.deadReason.length === 0) continue;
    counts.set(row.deadReason, (counts.get(row.deadReason) ?? 0) + 1);
  }
  if (counts.size === 0) return 'Most common last dead reasons: none';
  const ordered = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);
  return `Most common last dead reasons: ${ordered.map(([r, n]) => `${r} ${n}`).join(', ')}`;
}

/** Keep lines in order until the next would pass the cap; null when none fits. */
function fitLines(lines: readonly string[], maxCharacters: number): string | null {
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const addition = kept.length === 0 ? line.length : line.length + 1;
    if (used + addition > maxCharacters) break;
    kept.push(line);
    used += addition;
  }
  return kept.length === 0 ? null : kept.join('\n');
}

function countsLine(count: number): string {
  return `Counts from the last ${count} archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.`;
}

/**
 * The body of the plan prompt's history section over the `task_outcomes` rows
 * that ran, or null when fewer than `minimumTasks` ran or the first line does
 * not fit the character cap. The counts cover the `recentTasks` newest rows.
 *
 * @scenario metrics-and-reporting: Counted window
 * @scenario metrics-and-reporting: Character cap
 * @scenario metrics-and-reporting: Too little history
 * @adr 008
 */
export function formatHistoryHints(
  rows: readonly HistoryHintRow[],
  limits: PlanningHistoryConfig,
): string | null {
  if (rows.length < limits.minimumTasks) return null;
  const window = [...rows].sort(newestFirst).slice(0, limits.recentTasks);
  const lines: string[] = [countsLine(window.length)];

  const scopeLine = groupsLine('First attempt by scope files', scopeGroups(window));
  if (scopeLine !== null) lines.push(scopeLine);
  const verifyLine = groupsLine(
    'First attempt by verify kind',
    VERIFY_KINDS.map((kind) => groupOf(kind, window, (row) => row.verifyKind === kind)),
  );
  if (verifyLine !== null) lines.push(verifyLine);
  const testsLine = groupsLine('First attempt by tests.modify', [
    groupOf('true', window, (row) => row.testsModify === 1),
    groupOf('false', window, (row) => row.testsModify !== 1),
  ]);
  if (testsLine !== null) lines.push(testsLine);
  const scopeShareLine = groupsLine('First attempt by shared scope', [
    groupOf('shared', window, (row) => row.sharesScope === 1),
    groupOf('not shared', window, (row) => row.sharesScope !== 1),
  ]);
  if (scopeShareLine !== null) lines.push(scopeShareLine);
  const positionLine = groupsLine('First attempt by position', [
    groupOf('first task', window, (row) => row.position === 1),
    groupOf('later task', window, (row) => row.position !== 1),
  ]);
  if (positionLine !== null) lines.push(positionLine);

  lines.push(deadReasonLine(window));
  return fitLines(lines, limits.maxCharacters);
}

/** The plan prompt's two optional sections, either absent when null. */
export interface PlanHintSections {
  readonly history: string | null;
  readonly disclosures: string | null;
}

/**
 * Build both optional plan-prompt sections: the counted history hints and the
 * recent executor disclosures. The narrative numbers never block or warn.
 *
 * @scenario metrics-and-reporting: Section placement
 * @scenario metrics-and-reporting: Too little history
 * @adr 008
 */
export async function formatPlanHintSections(
  projectRoot: string,
  config: OsqConfig,
): Promise<PlanHintSections> {
  const limits = (config.planning ?? DEFAULT_PLANNING_CONFIG).history ?? DEFAULT_PLANNING_HISTORY;
  const history = formatHistoryHints(await readHistoryHintRows(projectRoot, config), limits);
  const disclosures = await formatRecentDisclosures(projectRoot, config);
  return { history, disclosures };
}
