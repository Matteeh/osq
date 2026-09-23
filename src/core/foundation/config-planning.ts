/**
 * Planning measurement settings. `idleGapMinutes` bounds the gap between two
 * owned turns that still counts as active planning; `prices` optionally maps a
 * model id to USD per million tokens so a slice can be priced when no harness
 * reported a cost. osq ships no price table of its own.
 */
export interface PlanningPrice {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

export interface PlanningConfig {
  readonly idleGapMinutes: number;
  readonly prices?: Readonly<Record<string, PlanningPrice>>;
}

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  idleGapMinutes: 10,
};

const PRICE_KINDS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;

/**
 * Validate an optional `planning` block over the defaults. A partial block
 * keeps the default idle gap; a present `prices` map must hold complete,
 * finite, non-negative price entries. Every rejection names the offending key.
 */
export function validatePlanningConfig(planning: unknown): PlanningConfig {
  if (planning === undefined) return DEFAULT_PLANNING_CONFIG;
  if (typeof planning !== 'object' || planning === null || Array.isArray(planning)) {
    throw new Error('planning configuration must be an object with idleGapMinutes');
  }
  const record = planning as Record<string, unknown>;
  const idleGapMinutes =
    record.idleGapMinutes === undefined
      ? DEFAULT_PLANNING_CONFIG.idleGapMinutes
      : record.idleGapMinutes;
  if (
    typeof idleGapMinutes !== 'number' ||
    !Number.isFinite(idleGapMinutes) ||
    idleGapMinutes <= 0
  ) {
    throw new Error('planning.idleGapMinutes must be a positive finite number');
  }
  const prices = validatePlanningPrices(record.prices);
  return prices === undefined ? { idleGapMinutes } : { idleGapMinutes, prices };
}

function validatePlanningPrices(
  prices: unknown,
): Readonly<Record<string, PlanningPrice>> | undefined {
  if (prices === undefined) return undefined;
  if (typeof prices !== 'object' || prices === null || Array.isArray(prices)) {
    throw new Error('planning.prices must be an object mapping model ids to prices');
  }
  const result: Record<string, PlanningPrice> = {};
  for (const [model, entry] of Object.entries(prices as Record<string, unknown>)) {
    result[model] = validatePlanningPrice(model, entry);
  }
  return result;
}

function validatePlanningPrice(model: string, entry: unknown): PlanningPrice {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new Error(
      `planning.prices.${model} must be an object with input, output, cacheRead, cacheWrite`,
    );
  }
  const record = entry as Record<string, unknown>;
  const price: Record<(typeof PRICE_KINDS)[number], number> = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  for (const kind of PRICE_KINDS) {
    const value = record[kind];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`planning.prices.${model}.${kind} must be a finite non-negative number`);
    }
    price[kind] = value;
  }
  return price;
}
