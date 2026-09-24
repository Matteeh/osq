import type { PlanningPrice } from '../foundation/config-planning.js';
import { type PlanningSession, readPlanningSessions } from './planning-records.js';
import { resolveSliceCost } from './planning-slice-measures.js';
import type { PlanningTurn } from './planning-slice.js';

/** One cost source's total dollars and contributing session count. */
export interface CostSourceBucket {
  readonly total: number;
  readonly sessions: number;
}

/**
 * Recorded planning cost split by provenance, plus the report-time estimates
 * `planning.prices` supplies for counted slices approval left unpriced.
 */
export interface PlanningCostBySource {
  readonly harness: CostSourceBucket;
  readonly approvalPrice: CostSourceBucket;
  readonly reportEstimate: CostSourceBucket;
  readonly totalWithEstimates: number;
}

/**
 * The `planning.prices` estimate for a session whose exit recorded no cost but
 * whose slice holds input and output tokens, using one turn carrying the slice
 * tokens and the `plan_started` model so a single-model session matches what
 * approval would have recorded. Null when the slice or price entry is missing.
 */
function estimateSessionCost(
  session: PlanningSession,
  prices: Readonly<Record<string, PlanningPrice>> | undefined,
): number | null {
  const exited = session.exited;
  const slice = exited?.data.slice;
  const model = session.started?.data.model ?? null;
  if (!exited || !slice || model === null || !prices?.[model]) return null;
  if (slice.tokens.input === null || slice.tokens.output === null) return null;

  const turn: PlanningTurn = {
    timestamp: exited.timestamp,
    model,
    inputTokens: slice.tokens.input,
    outputTokens: slice.tokens.output,
    cacheReadTokens: slice.tokens.cacheRead,
    cacheWriteTokens: slice.tokens.cacheWrite,
    reasoningTokens: slice.tokens.reasoning,
    cost: null,
    edits: [],
  };
  return resolveSliceCost([turn], false, null, prices).cost;
}

/**
 * Split every valid session's recorded cost into `harness` or `approvalPrice`
 * by its slice `costSource`, and estimate each unpriced sliced session whose
 * model `planning.prices` prices. No record is written.
 */
export async function collectCostBySource(
  folders: readonly string[],
  prices: Readonly<Record<string, PlanningPrice>> | undefined,
): Promise<PlanningCostBySource> {
  const harness = { total: 0, sessions: 0 };
  const approvalPrice = { total: 0, sessions: 0 };
  const reportEstimate = { total: 0, sessions: 0 };

  for (const folderPath of folders) {
    for (const session of await readPlanningSessions(folderPath)) {
      if (!session.started) continue;
      const exited = session.exited;
      if (!exited) continue;

      const cost = exited.data.usage.cost;
      if (cost !== null) {
        const bucket = exited.data.slice?.costSource === 'price_table' ? approvalPrice : harness;
        bucket.total += cost;
        bucket.sessions += 1;
        continue;
      }

      const estimate = estimateSessionCost(session, prices);
      if (estimate !== null) {
        reportEstimate.total += estimate;
        reportEstimate.sessions += 1;
      }
    }
  }

  return {
    harness: { ...harness },
    approvalPrice: { ...approvalPrice },
    reportEstimate: { ...reportEstimate },
    totalWithEstimates: harness.total + approvalPrice.total + reportEstimate.total,
  };
}

/** The report's dollar format for a source total. */
function formatSourceCost(total: number): string {
  return total >= 0.01 ? `$${total.toFixed(2)}` : `$${total.toFixed(4)}`;
}

/** One labelled line per source plus how much of the total is estimated. */
export function formatPlanningCostBySource(bySource: PlanningCostBySource | undefined): string[] {
  if (!bySource) return [];
  return [
    '  Planning cost by source:',
    `    Harness-reported: ${formatSourceCost(bySource.harness.total)} (${bySource.harness.sessions} sessions)`,
    `    Approval priced: ${formatSourceCost(bySource.approvalPrice.total)} (${bySource.approvalPrice.sessions} sessions)`,
    `    Estimated from planning.prices: ${formatSourceCost(bySource.reportEstimate.total)} (${bySource.reportEstimate.sessions} sessions)`,
    `  Planning cost with estimates: ${formatSourceCost(bySource.totalWithEstimates)} (${formatSourceCost(bySource.reportEstimate.total)} estimated)`,
  ];
}
