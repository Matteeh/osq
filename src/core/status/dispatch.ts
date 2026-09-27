import os from 'node:os';
import type { OsqConfig } from '../foundation/config.js';
import { type DispatchCard, readDispatchCard } from './dispatch-cards.js';
import { readDispatchItems } from './dispatch-items.js';
import {
  type FirstSeenTimes,
  type OrderedDispatchItem,
  orderDispatchItems,
} from './dispatch-order.js';
import { firstSeenTimes, readWaitLog } from './wait-log.js';

/** One ordered dispatch item with the card data for its kind. */
export interface DispatchQueueItem extends OrderedDispatchItem {
  readonly card: DispatchCard;
}

/** The ordered queue with every item's card. */
export interface DispatchQueue {
  readonly watcherIdle: boolean;
  readonly items: DispatchQueueItem[];
}

/** The ordered queue with only the first item's card. */
export interface DispatchPreview {
  readonly watcherIdle: boolean;
  readonly items: OrderedDispatchItem[];
  readonly card: DispatchCard | null;
}

/** The open episodes of the wait log under `home`, or an empty map without one. */
async function firstSeenFor(projectRoot: string, home: string): Promise<FirstSeenTimes> {
  const records = await readWaitLog(projectRoot, home);
  return records === null ? new Map() : firstSeenTimes(records);
}

/** The ordered items and whether the watcher is idle, without any card. */
async function orderedQueue(
  projectRoot: string,
  config: OsqConfig,
  home: string,
): Promise<{ watcherIdle: boolean; items: OrderedDispatchItem[] }> {
  const dispatch = await readDispatchItems(projectRoot, config);
  const firstSeen = await firstSeenFor(projectRoot, home);
  const items = await orderDispatchItems(projectRoot, config, dispatch, firstSeen);
  return { watcherIdle: dispatch.watcherIdle, items };
}

/** Read the ordered queue and only the first item's card, for text output. */
export async function readDispatch(
  projectRoot: string,
  config: OsqConfig,
  home = os.homedir(),
): Promise<DispatchPreview> {
  const { watcherIdle, items } = await orderedQueue(projectRoot, config, home);
  const [first] = items;
  const card = first ? await readDispatchCard(projectRoot, config, first) : null;
  return { watcherIdle, items, card };
}

/** Read the ordered queue with every item's card, for JSON output. */
export async function readDispatchQueue(
  projectRoot: string,
  config: OsqConfig,
  home = os.homedir(),
): Promise<DispatchQueue> {
  const { watcherIdle, items } = await orderedQueue(projectRoot, config, home);
  const withCards: DispatchQueueItem[] = [];
  for (const item of items) {
    withCards.push({ ...item, card: await readDispatchCard(projectRoot, config, item) });
  }
  return { watcherIdle, items: withCards };
}
