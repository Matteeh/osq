import type { PlanningCostSource, PlanningSlice, PlanningTokens } from './planning-slice.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function nullableNonNegative(value: unknown): number | null {
  return value === null || value === undefined ? null : finiteNonNegative(value);
}

function parseTokens(value: unknown): PlanningTokens | null {
  const tokens = asRecord(value);
  if (!tokens) return null;
  return {
    input: nullableNonNegative(tokens.input),
    output: nullableNonNegative(tokens.output),
    cacheRead: nullableNonNegative(tokens.cacheRead),
    cacheWrite: nullableNonNegative(tokens.cacheWrite),
    reasoning: nullableNonNegative(tokens.reasoning),
  };
}

function parseCostSource(value: unknown): PlanningCostSource | undefined {
  if (value === null || value === undefined) return null;
  if (value === 'harness' || value === 'price_table') return value;
  return undefined;
}

/** Read a persisted slice, leaving a missing or malformed value absent. */
export function parsePlanningSlice(value: unknown): PlanningSlice | undefined {
  const slice = asRecord(value);
  if (!slice) return undefined;
  const start = textOrNull(slice.start);
  const end = textOrNull(slice.end);
  const approvedAt = textOrNull(slice.approvedAt);
  const turns = finiteNonNegative(slice.turns);
  const activeMinutes = finiteNonNegative(slice.activeMinutes);
  const tokens = parseTokens(slice.tokens);
  const costSource = parseCostSource(slice.costSource);
  if (
    start === null ||
    end === null ||
    approvedAt === null ||
    turns === null ||
    activeMinutes === null ||
    tokens === null ||
    costSource === undefined
  ) {
    return undefined;
  }
  return {
    start,
    end,
    approvedAt,
    lastEditAt: textOrNull(slice.lastEditAt),
    turns,
    activeMinutes,
    tokens,
    costSource,
  };
}
