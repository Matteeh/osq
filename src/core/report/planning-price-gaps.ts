import type { PlanningPrice } from '../foundation/config-planning.js';
import { type PlanningSession, readPlanningSessions } from './planning-records.js';

/** Whether an exit recorded a token count that a price could be applied to. */
function hasRecordedTokens(session: PlanningSession): boolean {
  const exited = session.exited;
  if (!exited) return false;
  const { usage, slice } = exited.data;
  const sliceTokens = slice ? slice.tokens.input !== null || slice.tokens.output !== null : false;
  const usageTokens = usage.inputTokens !== null || usage.outputTokens !== null;
  return sliceTokens || usageTokens;
}

/** The exact configuration key an approver adds for a missing model price. */
export function formatPriceKey(model: string): string {
  return `planning.prices[${JSON.stringify(model)}]`;
}

/**
 * Sorted distinct `plan_started` models of sessions that recorded tokens but
 * have no `planning.prices` entry. A missing `prices` map leaves every model
 * unpriced.
 */
export async function findUnpricedPlanningModels(
  folders: readonly string[],
  prices: Readonly<Record<string, PlanningPrice>> | undefined,
): Promise<string[]> {
  const missing = new Set<string>();
  for (const folder of folders) {
    for (const session of await readPlanningSessions(folder)) {
      const model = session.started?.data.model ?? null;
      if (!model) continue;
      if (prices && Object.hasOwn(prices, model)) continue;
      if (!hasRecordedTokens(session)) continue;
      missing.add(model);
    }
  }
  return [...missing].sort();
}
