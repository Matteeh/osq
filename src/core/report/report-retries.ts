/** Pure retry-history observation shared by the terminal report and web documents. */

import { asData } from './report-events.js';

/** One side of the retry split: automatic or manual. */
export interface RetryGroupHistory {
  readonly count: number;
  readonly reachedDone: number;
  readonly cost: number;
  readonly costReportedAttempts: number;
}

/**
 * Retry outcomes split by who requested them, plus the number of `stuck`
 * events. Costs never mix attempts: a pre-retry cost is not part of any
 * retry-opened attempt.
 */
export interface RetryHistory {
  readonly automatic: RetryGroupHistory;
  readonly manual: RetryGroupHistory;
  readonly stuck: number;
}

/** A group under construction while one stream is scanned. */
interface MutableRetryGroup {
  count: number;
  reachedDone: number;
  cost: number;
  costReportedAttempts: number;
  doneThisAttempt: boolean;
  reportedThisAttempt: boolean;
}

function emptyMutableGroup(): MutableRetryGroup {
  return {
    count: 0,
    reachedDone: 0,
    cost: 0,
    costReportedAttempts: 0,
    doneThisAttempt: false,
    reportedThisAttempt: false,
  };
}

function freezeGroup(group: MutableRetryGroup): RetryGroupHistory {
  return {
    count: group.count,
    reachedDone: group.reachedDone,
    cost: group.cost,
    costReportedAttempts: group.costReportedAttempts,
  };
}

/** An all-zero retry history, used as the accumulation seed. */
export function emptyRetryHistory(): RetryHistory {
  return {
    automatic: {
      count: 0,
      reachedDone: 0,
      cost: 0,
      costReportedAttempts: 0,
    },
    manual: {
      count: 0,
      reachedDone: 0,
      cost: 0,
      costReportedAttempts: 0,
    },
    stuck: 0,
  };
}

/**
 * Projects one numbered task stream. Each `retry` event opens an attempt that
 * runs to the next `retry` or the end of the stream; a `done` inside it counts
 * as reached, and finite cost values inside it sum into the group. A cost
 * before the first retry belongs to no retry-opened attempt and is ignored.
 */
export function observeRetries(events: readonly Record<string, unknown>[]): RetryHistory {
  const automatic = emptyMutableGroup();
  const manual = emptyMutableGroup();
  let stuck = 0;
  let active: MutableRetryGroup | null = null;

  for (const event of events) {
    const type = event.type;
    const data = asData(event);

    if (type === 'retry') {
      active = data?.automatic === true ? automatic : manual;
      active.count++;
      active.doneThisAttempt = false;
      active.reportedThisAttempt = false;
      continue;
    }

    if (type === 'stuck') {
      stuck++;
      continue;
    }

    if (active === null) continue;

    if (type === 'done') {
      if (!active.doneThisAttempt) {
        active.doneThisAttempt = true;
        active.reachedDone++;
      }
      continue;
    }

    const rawCost = data?.cost;
    if (typeof rawCost === 'number' && Number.isFinite(rawCost)) {
      active.cost += rawCost;
      if (!active.reportedThisAttempt) {
        active.reportedThisAttempt = true;
        active.costReportedAttempts++;
      }
    }
  }

  return { automatic: freezeGroup(automatic), manual: freezeGroup(manual), stuck };
}

function addGroup(left: RetryGroupHistory, right: RetryGroupHistory): RetryGroupHistory {
  return {
    count: left.count + right.count,
    reachedDone: left.reachedDone + right.reachedDone,
    cost: left.cost + right.cost,
    costReportedAttempts: left.costReportedAttempts + right.costReportedAttempts,
  };
}

/** Sums two retry histories field by field. */
export function addRetryHistory(left: RetryHistory, right: RetryHistory): RetryHistory {
  return {
    automatic: addGroup(left.automatic, right.automatic),
    manual: addGroup(left.manual, right.manual),
    stuck: left.stuck + right.stuck,
  };
}
