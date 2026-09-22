import { asData, parseTokenEvent } from './report-events.js';
import type { WebTokenGroup } from './web-data-types.js';

/** Mutable accumulator for one harness/model token group. */
export interface TokenDraft {
  harness: string;
  model: string | null;
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
  total: number;
}

function tokenGroupKey(harness: string, model: string | null): string {
  return `${harness}\u0000${model ?? ''}`;
}

/** Adds one token delta to its harness/model group, creating it when absent. */
export function mergeTokenDraft(
  groups: Map<string, TokenDraft>,
  harness: string,
  model: string | null,
  delta: { input: number; cachedInput: number; output: number; reasoning: number; total: number },
): void {
  const key = tokenGroupKey(harness, model);
  const draft = groups.get(key) ?? {
    harness,
    model,
    input: 0,
    cachedInput: 0,
    output: 0,
    reasoning: 0,
    total: 0,
  };
  draft.input += delta.input;
  draft.cachedInput += delta.cachedInput;
  draft.output += delta.output;
  draft.reasoning += delta.reasoning;
  draft.total += delta.total;
  groups.set(key, draft);
}

/** Materializes one token group map in stable harness/model order. */
export function sortedTokenGroups(groups: Map<string, TokenDraft>): WebTokenGroup[] {
  return [...groups.values()]
    .map((draft) => ({ ...draft }))
    .sort(
      (a, b) => a.harness.localeCompare(b.harness) || (a.model ?? '').localeCompare(b.model ?? ''),
    );
}

/**
 * Groups token counters by the recorded harness and nullable model. The current
 * provenance comes from the most recent `started` event unless a token event
 * explicitly carries its own; keys include both fields so unlike provenance is
 * never merged.
 */
export function observeTokenGroups(
  events: readonly Record<string, unknown>[],
): Map<string, TokenDraft> {
  const groups = new Map<string, TokenDraft>();
  let harness = '';
  let model: string | null = null;

  for (const event of events) {
    const data = asData(event);
    if (!data) continue;
    if (event.type === 'started') {
      if (typeof data.harness === 'string') harness = data.harness;
      model = typeof data.model === 'string' && data.model ? data.model : null;
      continue;
    }
    if (event.type !== 'tokens') continue;
    const eventHarness = typeof data.harness === 'string' && data.harness ? data.harness : harness;
    const eventModel =
      typeof data.model === 'string' && data.model
        ? data.model
        : data.model === null
          ? null
          : model;
    mergeTokenDraft(groups, eventHarness, eventModel, parseTokenEvent(data));
  }
  return groups;
}
