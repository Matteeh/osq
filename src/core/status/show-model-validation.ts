import type { TimelineEvent, ValidatorRanEventData } from './show-types.js';

/** The change-level stream name on events read from `change.jsonl`. */
const CHANGE_STREAM = 'change';

/** A timestamp's sortable value; absent or invalid timestamps sort first. */
function timestampValue(timestamp: string): number {
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}

/**
 * The data of the latest `validator_ran` event on the change stream, by
 * timestamp, or undefined when the timeline holds none. It reads only the
 * timeline it is given.
 */
export function buildValidation(
  timeline: readonly TimelineEvent[],
): ValidatorRanEventData | undefined {
  let latest: TimelineEvent | undefined;
  for (const event of timeline) {
    if (event.type !== 'validator_ran' || event.taskNumber !== CHANGE_STREAM) continue;
    if (
      latest === undefined ||
      timestampValue(event.timestamp) >= timestampValue(latest.timestamp)
    ) {
      latest = event;
    }
  }
  return latest?.data as ValidatorRanEventData | undefined;
}
