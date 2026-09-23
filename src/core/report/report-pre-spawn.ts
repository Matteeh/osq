/** Pre-spawn verify counts beyond runs and mismatches, derived from task events. */

import { asData } from './report-events.js';

/** Total and zero-exit runs for one declared start state. */
export interface PreSpawnStartCount {
  runs: number;
  passed: number;
}

/** The three declared start states a pre-spawn event can carry. */
export interface PreSpawnStartCounts {
  red: PreSpawnStartCount;
  green: PreSpawnStartCount;
  any: PreSpawnStartCount;
}

/** Pre-spawn runs with missing named paths and the per-start breakdown. */
export interface PreSpawnEventCounts {
  readonly missingPathRuns: number;
  readonly byStart: PreSpawnStartCounts;
}

function isStartState(value: unknown): value is 'red' | 'green' | 'any' {
  return value === 'red' || value === 'green' || value === 'any';
}

function emptyCounts(): PreSpawnStartCounts {
  return {
    red: { runs: 0, passed: 0 },
    green: { runs: 0, passed: 0 },
    any: { runs: 0, passed: 0 },
  };
}

/**
 * Counts one numbered task stream's pre-spawn verify runs: how many recorded a
 * non-empty `missingPaths`, and, per declared `expected` start, how many ran and
 * how many exited zero. Post-spawn runs, absent or unknown expected values, and
 * empty missing-path lists are left out.
 */
export function observePreSpawnEvents(
  events: readonly Record<string, unknown>[],
): PreSpawnEventCounts {
  let missingPathRuns = 0;
  const byStart = emptyCounts();

  for (const event of events) {
    if (event.type !== 'verify_ran') continue;
    const data = asData(event);
    if (data?.phase !== 'pre_spawn') continue;

    if (Array.isArray(data.missingPaths) && data.missingPaths.length > 0) missingPathRuns++;

    const expected = data.expected;
    if (!isStartState(expected)) continue;
    const bucket = byStart[expected];
    bucket.runs++;
    if (data.exitCode === 0) bucket.passed++;
  }

  return { missingPathRuns, byStart };
}
