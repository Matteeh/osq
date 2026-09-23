import type { PlanningPrice } from '../foundation/config-planning.js';
import type { PlanningCostSource, PlanningTokens, PlanningTurn } from './planning-slice.js';

/** Add a nullable recorded value to a nullable running total. */
function add(total: number | null, value: number | null): number | null {
  return value === null ? total : (total ?? 0) + value;
}

/** Per-kind sums over owned turns; a kind is null when no turn reported it. */
export function sumTokens(turns: readonly PlanningTurn[]): PlanningTokens {
  let input: number | null = null;
  let output: number | null = null;
  let cacheRead: number | null = null;
  let cacheWrite: number | null = null;
  let reasoning: number | null = null;
  for (const turn of turns) {
    input = add(input, turn.inputTokens);
    output = add(output, turn.outputTokens);
    cacheRead = add(cacheRead, turn.cacheReadTokens);
    cacheWrite = add(cacheWrite, turn.cacheWriteTokens);
    reasoning = add(reasoning, turn.reasoningTokens);
  }
  return { input, output, cacheRead, cacheWrite, reasoning };
}

/** Combined cached tokens: null only when neither cache kind was reported. */
export function combineCache(read: number | null, write: number | null): number | null {
  return read === null && write === null ? null : (read ?? 0) + (write ?? 0);
}

/** Sum gaps at most the idle gap, rounded to two decimals. */
export function activeMinutes(turns: readonly PlanningTurn[], idleGapMinutes: number): number {
  if (turns.length < 2) return 0;
  const limit = idleGapMinutes * 60_000;
  let totalMs = 0;
  for (let index = 1; index < turns.length; index++) {
    const previous = Date.parse(turns[index - 1].timestamp);
    const current = Date.parse(turns[index].timestamp);
    if (!Number.isFinite(previous) || !Number.isFinite(current)) continue;
    const gap = current - previous;
    if (gap > 0 && gap <= limit) totalMs += gap;
  }
  return Math.round((totalMs / 60_000) * 100) / 100;
}

/** Latest owned turn that edited at least one path. */
export function lastEditTimestamp(turns: readonly PlanningTurn[]): string | null {
  for (let index = turns.length - 1; index >= 0; index--) {
    if (turns[index].edits.length > 0) return turns[index].timestamp;
  }
  return null;
}

export interface SliceCost {
  readonly cost: number | null;
  readonly costSource: PlanningCostSource;
}

/** Sum a `planning.prices` estimate, or null when a turn cannot be priced. */
function priceEstimate(
  turns: readonly PlanningTurn[],
  prices: Readonly<Record<string, PlanningPrice>> | undefined,
): number | null {
  if (!prices || turns.length === 0) return null;
  let total = 0;
  for (const turn of turns) {
    if (turn.model === null) return null;
    const price = prices[turn.model];
    if (!price) return null;
    if (turn.inputTokens === null || turn.outputTokens === null) return null;
    total +=
      (turn.inputTokens * price.input +
        turn.outputTokens * price.output +
        (turn.cacheReadTokens ?? 0) * price.cacheRead +
        (turn.cacheWriteTokens ?? 0) * price.cacheWrite) /
      1_000_000;
  }
  return total;
}

/** Slice cost by the ordered per-turn, whole-session, price-table rules. */
export function resolveSliceCost(
  turns: readonly PlanningTurn[],
  completeSession: boolean,
  sessionCost: number | null,
  prices: Readonly<Record<string, PlanningPrice>> | undefined,
): SliceCost {
  if (turns.length > 0 && turns.every((turn) => turn.cost !== null)) {
    const cost = turns.reduce((sum, turn) => sum + (turn.cost ?? 0), 0);
    return { cost, costSource: 'harness' };
  }
  if (completeSession && sessionCost !== null) return { cost: sessionCost, costSource: 'harness' };
  const estimated = priceEstimate(turns, prices);
  if (estimated !== null) return { cost: estimated, costSource: 'price_table' };
  return { cost: null, costSource: null };
}
