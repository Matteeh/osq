/**
 * Planning measurement settings. `idleGapMinutes` bounds the gap between two
 * owned turns that still counts as active planning; `prices` optionally maps a
 * model id to USD per million tokens so a slice can be priced when no harness
 * reported a cost. `disclosures` bounds the executor disclosures the plan
 * prompt quotes from recent archived changes. osq ships no price table of its
 * own.
 */
export interface PlanningPrice {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
}

/** Bounds on the executor disclosures quoted in the plan prompt. */
export interface PlanningDisclosuresConfig {
  /** How many of the newest archived changes may contribute disclosures. */
  readonly recentChanges: number;
  /** Total characters of quoted disclosure entries, excluding the claim line. */
  readonly maxCharacters: number;
}

/** Bounds on the counted `## What history says` lines in the plan prompt. */
export interface PlanningHistoryConfig {
  /** Tasks that ran before the section appears at all. */
  readonly minimumTasks: number;
  /** Most recent of those tasks the counts cover. */
  readonly recentTasks: number;
  /** Most characters the section body holds, each newline counted. */
  readonly maxCharacters: number;
}

export interface PlanningConfig {
  readonly idleGapMinutes: number;
  readonly disclosures: PlanningDisclosuresConfig;
  /** Optional so hand-built configs still typecheck; readers fall back to the default. */
  readonly history?: PlanningHistoryConfig;
  /** Optional so hand-built configs still typecheck; readers fall back to the default. */
  readonly record?: PlanningRecordConfig;
  readonly prices?: Readonly<Record<string, PlanningPrice>>;
}

/** Bounds on the shared repository record in the plan prompt. */
export interface PlanningRecordConfig {
  /** Fewest measured tasks before the record prints its lines. */
  readonly minimumTasks: number;
  /** Most archived changes the record's window holds. */
  readonly recentChanges: number;
  /** Most dead outcome rows the record keeps. */
  readonly deadOutcomes: number;
}

export const DEFAULT_PLANNING_DISCLOSURES: PlanningDisclosuresConfig = {
  recentChanges: 3,
  maxCharacters: 4000,
};

export const DEFAULT_PLANNING_HISTORY: PlanningHistoryConfig = {
  minimumTasks: 30,
  recentTasks: 100,
  maxCharacters: 1500,
};

export const DEFAULT_PLANNING_RECORD: PlanningRecordConfig = {
  minimumTasks: 5,
  recentChanges: 20,
  deadOutcomes: 10,
};

export const DEFAULT_PLANNING_CONFIG: PlanningConfig = {
  idleGapMinutes: 10,
  disclosures: DEFAULT_PLANNING_DISCLOSURES,
  history: DEFAULT_PLANNING_HISTORY,
  record: DEFAULT_PLANNING_RECORD,
};

const PRICE_KINDS = ['input', 'output', 'cacheRead', 'cacheWrite'] as const;

/**
 * Validate an optional `planning` block over the defaults. A partial block
 * keeps the default idle gap; a present `prices` map must hold complete,
 * finite, non-negative price entries. Every rejection names the offending key.
 *
 * @scenario metrics-and-reporting: Invalid history configuration
 * @scenario metrics-and-reporting: Invalid record configuration
 * @adr 008
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
  const disclosures = validatePlanningDisclosures(record.disclosures);
  const history = validatePlanningHistory(record.history);
  const repositoryRecord = validatePlanningRecord(record.record);
  const prices = validatePlanningPrices(record.prices);
  return prices === undefined
    ? { idleGapMinutes, disclosures, history, record: repositoryRecord }
    : { idleGapMinutes, disclosures, history, record: repositoryRecord, prices };
}

/** A partial `history` block keeps defaults; every value is a positive integer. */
function validatePlanningHistory(history: unknown): PlanningHistoryConfig {
  if (history === undefined) return DEFAULT_PLANNING_HISTORY;
  if (typeof history !== 'object' || history === null || Array.isArray(history)) {
    throw new Error(
      'planning.history must be an object with minimumTasks, recentTasks and maxCharacters',
    );
  }
  const record = history as Record<string, unknown>;
  return {
    minimumTasks: validateCount(
      'planning.history',
      'minimumTasks',
      record.minimumTasks,
      DEFAULT_PLANNING_HISTORY.minimumTasks,
    ),
    recentTasks: validateCount(
      'planning.history',
      'recentTasks',
      record.recentTasks,
      DEFAULT_PLANNING_HISTORY.recentTasks,
    ),
    maxCharacters: validateCount(
      'planning.history',
      'maxCharacters',
      record.maxCharacters,
      DEFAULT_PLANNING_HISTORY.maxCharacters,
    ),
  };
}

/** A partial `record` block keeps defaults; every value is a positive integer. */
function validatePlanningRecord(record: unknown): PlanningRecordConfig {
  if (record === undefined) return DEFAULT_PLANNING_RECORD;
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    throw new Error(
      'planning.record must be an object with minimumTasks, recentChanges and deadOutcomes',
    );
  }
  const values = record as Record<string, unknown>;
  return {
    minimumTasks: validateCount(
      'planning.record',
      'minimumTasks',
      values.minimumTasks,
      DEFAULT_PLANNING_RECORD.minimumTasks,
    ),
    recentChanges: validateCount(
      'planning.record',
      'recentChanges',
      values.recentChanges,
      DEFAULT_PLANNING_RECORD.recentChanges,
    ),
    deadOutcomes: validateCount(
      'planning.record',
      'deadOutcomes',
      values.deadOutcomes,
      DEFAULT_PLANNING_RECORD.deadOutcomes,
    ),
  };
}

function validatePlanningDisclosures(disclosures: unknown): PlanningDisclosuresConfig {
  if (disclosures === undefined) return DEFAULT_PLANNING_DISCLOSURES;
  if (typeof disclosures !== 'object' || disclosures === null || Array.isArray(disclosures)) {
    throw new Error('planning.disclosures must be an object with recentChanges and maxCharacters');
  }
  const record = disclosures as Record<string, unknown>;
  return {
    recentChanges: validateCount(
      'planning.disclosures',
      'recentChanges',
      record.recentChanges,
      DEFAULT_PLANNING_DISCLOSURES.recentChanges,
    ),
    maxCharacters: validateCount(
      'planning.disclosures',
      'maxCharacters',
      record.maxCharacters,
      DEFAULT_PLANNING_DISCLOSURES.maxCharacters,
    ),
  };
}

/** A partial block keeps defaults; every value is a positive integer. */
function validateCount(prefix: string, key: string, value: unknown, fallback: number): number {
  const resolved = value === undefined ? fallback : value;
  if (typeof resolved !== 'number' || !Number.isInteger(resolved) || resolved <= 0) {
    throw new Error(`${prefix}.${key} must be a positive integer`);
  }
  return resolved;
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
