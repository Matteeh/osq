import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_GATES_CONFIG } from '../core/foundation/config-gates.js';
import { asRecord } from '../harness/stream.js';

// A provider outage death is not a task failure: the provider, not the attempt,
// was at fault. It therefore gets its own wait and its own retry budget, and it
// never triggers the stuck rule. The decision is re-derived from disk each
// cycle, so a restart between a death and its retry neither loses nor repeats.

/** Dead reason recorded when an attempt ended with an open provider retry. */
export const PROVIDER_REASON = 'provider_unavailable';

/** Gate defaults applied when a partial config omits a provider key. */
export const PROVIDER_DEFAULTS = {
  retries: DEFAULT_GATES_CONFIG.providerRetries as number,
  delaySeconds: DEFAULT_GATES_CONFIG.providerRetryDelaySeconds as number,
} as const;

export interface StreamEvent {
  readonly type?: unknown;
  readonly timestamp?: unknown;
  readonly data?: unknown;
}

/** Read a task's events, skipping malformed lines and never failing on absence. */
export async function readStream(folderPath: string, taskNumber: string): Promise<StreamEvent[]> {
  const raw = await fs
    .readFile(path.join(folderPath, '.run', 'events', `${taskNumber}.jsonl`), 'utf8')
    .catch(() => '');
  const events: StreamEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as StreamEvent);
    } catch {
      // A malformed line never blocks the decision.
    }
  }
  return events;
}

function dataOf(event: StreamEvent): Record<string, unknown> {
  return event.data !== null && typeof event.data === 'object'
    ? (event.data as Record<string, unknown>)
    : {};
}

/** The later of two ISO timestamps, tolerating either being absent. */
export function laterOf(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a > b ? a : b;
}

/** A task's most recent manual retry timestamp; the budget's later cutoff. */
export function lastManualRetryAt(events: readonly StreamEvent[]): string | undefined {
  let latest: string | undefined;
  for (const event of events) {
    if (event.type !== 'retry' || dataOf(event).automatic === true) continue;
    if (typeof event.timestamp !== 'string') continue;
    latest = laterOf(latest, event.timestamp);
  }
  return latest;
}

/** Non-provider automatic retries since the cutoff; provider retries have their own. */
export function automaticRetriesSince(events: readonly StreamEvent[], cutoff?: string): number {
  let count = 0;
  for (const event of events) {
    if (event.type !== 'retry') continue;
    const data = dataOf(event);
    if (data.automatic !== true || data.reason === PROVIDER_REASON) continue;
    if (cutoff !== undefined && typeof event.timestamp === 'string' && event.timestamp < cutoff) {
      continue;
    }
    count += 1;
  }
  return count;
}

/** Latest `dead` event timestamp, which starts the provider wait clock. */
function latestDeadAt(events: readonly unknown[]): string | undefined {
  let latest: string | undefined;
  for (const event of events) {
    const record = asRecord(event);
    if (record?.type !== 'dead' || typeof record.timestamp !== 'string') continue;
    if (latest === undefined || record.timestamp > latest) latest = record.timestamp;
  }
  return latest;
}

/** Automatic provider retries recorded since the cutoff. */
function providerRetriesSince(events: readonly unknown[], cutoff?: string): number {
  let count = 0;
  for (const event of events) {
    const record = asRecord(event);
    if (record?.type !== 'retry') continue;
    const data = asRecord(record.data);
    if (data?.automatic !== true || data.reason !== PROVIDER_REASON) continue;
    if (cutoff !== undefined && typeof record.timestamp === 'string' && record.timestamp < cutoff) {
      continue;
    }
    count += 1;
  }
  return count;
}

export interface ProviderRetryContext {
  /** The task's full event stream, oldest first. */
  readonly events: readonly unknown[];
  /** `gates.providerRetries`: how many automatic provider retries remain. */
  readonly providerRetries: number;
  /** `gates.providerRetryDelaySeconds`: wait after the latest `dead` event. */
  readonly delaySeconds: number;
  /** Later of the manifest approval and the last manual retry, when either exists. */
  readonly cutoff?: string;
  /** Current time in epoch milliseconds; injected so tests can cross the wait. */
  readonly now: number;
}

/**
 * Whether a `provider_unavailable` death may be retried now. It never retries
 * before `delaySeconds` have passed since the latest `dead` event, and it stops
 * once `providerRetries` automatic provider retries have been spent since the
 * cutoff (the later of approval and the last manual retry).
 */
export function decideProviderRetry(context: ProviderRetryContext): boolean {
  if (context.providerRetries <= 0) return false;
  if (providerRetriesSince(context.events, context.cutoff) >= context.providerRetries) {
    return false;
  }
  const deadAt = latestDeadAt(context.events);
  if (deadAt === undefined) return false;
  const elapsedMs = context.now - Date.parse(deadAt);
  return Number.isFinite(elapsedMs) && elapsedMs >= context.delaySeconds * 1000;
}
