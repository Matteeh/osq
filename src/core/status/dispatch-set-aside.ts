import type { OrderedDispatchItem } from './dispatch-order.js';
import { dispatchIdentity } from './wait-log.js';

/** The ordered items, each set-aside one moved behind the rest, in set-aside order. */
export function applySetAsides(
  items: readonly OrderedDispatchItem[],
  setAside: readonly string[],
): OrderedDispatchItem[] {
  const setAsideIds = new Set(setAside);
  const rest = items.filter((item) => !setAsideIds.has(dispatchIdentity(item)));
  const behind: OrderedDispatchItem[] = [];
  for (const id of setAside) {
    const found = items.find((item) => dispatchIdentity(item) === id);
    if (found !== undefined) behind.push(found);
  }
  return [...rest, ...behind];
}
