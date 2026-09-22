import path from 'node:path';
import { DEFAULT_CONFIG, type OsqConfig } from '../foundation/config.js';
import { type PlanRecord, readPlanRecords } from '../report/planning.js';
import type { QueueItem } from './queue-parser.js';
import {
  type QueueRow,
  type QueueStateSnapshot,
  findActiveQueueFailures,
  readQueueState,
  scanQueueAssociations,
} from './queue-state.js';

export interface LandedDependency {
  readonly slug: string;
  readonly changeId: string;
  readonly archivePath: string;
}

export interface QueuePlanSelection {
  readonly item: QueueItem;
  readonly row: QueueRow;
  readonly replan: boolean;
  readonly landedDependencies: readonly LandedDependency[];
}

export type QueuePlanPreparation =
  | { readonly kind: 'ready'; readonly selection: QueuePlanSelection; readonly notice?: string }
  | { readonly kind: 'refused'; readonly message: string };

/** Recorded queue planning spend across every associated change. */
export interface QueuePlanningUsage {
  /** Number of valid `plan_started` records (each counted once). */
  readonly sessions: number;
  /** Sum of finite recorded cost from singly correlated exits. */
  readonly cost: number;
  /** True only when every counted start has one exit with a finite cost. */
  readonly costCoverageComplete: boolean;
}

export type QueueBudgetEvaluation =
  | { readonly kind: 'ok'; readonly notice?: string }
  | { readonly kind: 'refused'; readonly message: string };

const QUEUE_BUDGET_REQUIRED =
  'Non-print `plan --next` requires queue.maxPlanningSessions and queue.maxPlanningCost in osq.config.ts.';

/** Correlate one change's planning records into start counts and finite cost. */
function aggregatePlanUsage(records: readonly PlanRecord[]): QueuePlanningUsage {
  const starts = new Map<string, number>();
  const exits = new Map<string, (number | null)[]>();
  for (const record of records) {
    if (record.type === 'plan_started') {
      starts.set(record.sessionId, (starts.get(record.sessionId) ?? 0) + 1);
    } else {
      const costs = exits.get(record.sessionId) ?? [];
      costs.push(record.data.usage.cost);
      exits.set(record.sessionId, costs);
    }
  }
  let sessions = 0;
  let cost = 0;
  let complete = true;
  for (const [sessionId, startCount] of starts) {
    // Count every valid start once; malformed duplicates do not shift the count.
    sessions += startCount;
    const matched = exits.get(sessionId) ?? [];
    if (startCount !== 1 || matched.length !== 1 || matched[0] === null) {
      complete = false;
      continue;
    }
    cost += matched[0];
  }
  return { sessions, cost, costCoverageComplete: complete };
}

/**
 * Read the planning spend of every queue-associated change across active,
 * archived, and rejected locations, including retained attempts whose slug is
 * no longer in the current queue. Malformed records and non-queue changes
 * contribute nothing.
 */
export async function readQueuePlanningUsage(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
): Promise<QueuePlanningUsage> {
  const groups = await scanQueueAssociations(projectRoot, config, null);
  const visited = new Set<string>();
  let sessions = 0;
  let cost = 0;
  let complete = true;
  for (const group of groups.values()) {
    for (const assoc of [...group.active, ...group.archived, ...group.rejected]) {
      if (visited.has(assoc.folderPath)) continue;
      visited.add(assoc.folderPath);
      const aggregate = aggregatePlanUsage(await readPlanRecords(assoc.folderPath));
      sessions += aggregate.sessions;
      cost += aggregate.cost;
      complete = complete && aggregate.costCoverageComplete;
    }
  }
  return { sessions, cost, costCoverageComplete: complete };
}

/**
 * Apply the queue spend gates to a read-only usage aggregate. The session gate
 * is always enforced; the cost gate is enforced only when coverage is complete.
 * Incomplete coverage yields one factual note and leaves the cost gate off.
 */
export function evaluateQueueBudget(
  config: OsqConfig,
  usage: QueuePlanningUsage,
): QueueBudgetEvaluation {
  const queue = config.queue;
  if (
    !queue ||
    !Number.isFinite(queue.maxPlanningSessions) ||
    !Number.isFinite(queue.maxPlanningCost) ||
    queue.maxPlanningSessions < 0 ||
    queue.maxPlanningCost < 0
  ) {
    return { kind: 'refused', message: QUEUE_BUDGET_REQUIRED };
  }
  if (usage.sessions + 1 > queue.maxPlanningSessions) {
    return {
      kind: 'refused',
      message: `Queue planning session limit reached: ${usage.sessions} recorded session(s) against a maximum of ${queue.maxPlanningSessions}; launching another planner would exceed it.`,
    };
  }
  if (usage.costCoverageComplete && usage.cost >= queue.maxPlanningCost) {
    return {
      kind: 'refused',
      message: `Queue planning cost limit reached: recorded cost ${usage.cost} has reached the maximum of ${queue.maxPlanningCost}.`,
    };
  }
  if (!usage.costCoverageComplete) {
    return {
      kind: 'ok',
      notice:
        'Recorded planning cost coverage is incomplete, so the queue cost ceiling is not enforced.',
    };
  }
  return { kind: 'ok' };
}

function summarizeRows(rows: readonly QueueRow[]): string {
  return rows
    .map((row) => {
      const waiting =
        row.unmetDependencies.length > 0 ? ` (waiting on ${row.unmetDependencies.join(', ')})` : '';
      return `  - ${row.slug}: ${row.state}${waiting}`;
    })
    .join('\n');
}

/**
 * Read-only next-item preparation: halt on any active failure, then select the
 * first unplanned or rejected item whose queue dependencies are landed. A
 * rejected first eligible item refuses unless `replan` is set. Nothing is
 * written here.
 */
export async function prepareQueuePlan(
  projectRoot: string,
  config: OsqConfig = DEFAULT_CONFIG,
  options: { replan?: boolean; enforceBudget?: boolean } = {},
): Promise<QueuePlanPreparation> {
  const failures = await findActiveQueueFailures(projectRoot, config);
  if (failures.length > 0) {
    const lines = failures.map(
      (f) => `  - ${f.changeId} ${f.target} (${f.reason}): ${f.retryCommand}`,
    );
    return {
      kind: 'refused',
      message: `Queue planning is blocked by active failures:\n${lines.join('\n')}`,
    };
  }
  const state: QueueStateSnapshot = await readQueueState(projectRoot, config);
  const { items, groups, rows } = state;
  const index = rows.findIndex(
    (row) =>
      (row.state === 'unplanned' || row.state === 'rejected') && row.unmetDependencies.length === 0,
  );
  if (index === -1) {
    return {
      kind: 'refused',
      message: `No queue item is eligible to plan.\n${summarizeRows(rows)}`,
    };
  }
  const row = rows[index];
  if (row.state === 'rejected' && !options.replan) {
    return {
      kind: 'refused',
      message: `Queue item "${row.slug}" has ${row.rejectionCount} rejected attempt(s) and no active plan. Re-run with --replan to create a new attempt.`,
    };
  }
  let notice: string | undefined;
  if (options.enforceBudget) {
    const evaluation = evaluateQueueBudget(
      config,
      await readQueuePlanningUsage(projectRoot, config),
    );
    if (evaluation.kind === 'refused') return { kind: 'refused', message: evaluation.message };
    notice = evaluation.notice;
  }
  const item = items[index];
  const landedDependencies: LandedDependency[] = [];
  for (const dep of item.dependsOn) {
    const archived = groups.get(dep)?.archived ?? [];
    if (archived.length === 1) {
      landedDependencies.push({
        slug: dep,
        changeId: archived[0].id,
        archivePath: path.relative(projectRoot, archived[0].folderPath),
      });
    }
  }
  return {
    kind: 'ready',
    selection: { item, row, replan: row.state === 'rejected', landedDependencies },
    ...(notice ? { notice } : {}),
  };
}
