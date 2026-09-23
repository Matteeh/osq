/** Pure event-stream observation helpers shared by the terminal report and web documents. */

/** Parse one append-only jsonl stream, skipping blank and malformed lines. */
export function parseEventLines(content: string): Record<string, unknown>[] {
  const events: Record<string, unknown>[] = [];
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        events.push(parsed as Record<string, unknown>);
      }
    } catch {}
  }
  return events;
}

/** The typed `data` object of an event, or null when absent or malformed. */
export function asData(event: Record<string, unknown>): Record<string, unknown> | null {
  const data = event.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

/** Event timestamp in epoch milliseconds, or null when missing or invalid. */
export function eventTimestampMs(event: Record<string, unknown>): number | null {
  if (typeof event.timestamp !== 'string') return null;
  const ms = Date.parse(event.timestamp);
  return Number.isFinite(ms) ? ms : null;
}

/** One token delta parsed from a `tokens` event, with cached input retained. */
export interface ObservedTokenDelta {
  readonly input: number;
  readonly cachedInput: number;
  readonly output: number;
  readonly reasoning: number;
  readonly total: number;
}

/**
 * Parses one `tokens` event. A harness-reported cache counter is authoritative;
 * the remainder formula is a fallback used when the event carries no cache field.
 */
export function parseTokenEvent(data: Record<string, unknown>): ObservedTokenDelta {
  const input =
    Number(data.input ?? data.input_tokens ?? data.promptTokens ?? data.prompt ?? 0) || 0;
  const output =
    Number(
      data.output ??
        data.output_tokens ??
        data.candidateTokens ??
        data.candidate ??
        data.completionTokens ??
        0,
    ) || 0;
  const reasoning =
    Number(data.reasoningTokens ?? data.reasoning ?? data.thinking_tokens ?? 0) || 0;

  const cacheValue =
    typeof data.cache === 'number'
      ? data.cache
      : typeof data.cache === 'object' && data.cache !== null && !Array.isArray(data.cache)
        ? (data.cache as Record<string, unknown>).read
        : undefined;
  const reportedCachedInput =
    Number(data.cached_input ?? data.cachedTokens ?? data.cache_read_tokens ?? cacheValue ?? 0) ||
    0;
  const hasReportedCache =
    data.cachedTokens !== undefined ||
    data.cached_input !== undefined ||
    data.cache_read_tokens !== undefined ||
    cacheValue !== undefined;

  const rawTotal = data.total ?? data.totalTokens;
  const hasReportedTotal = rawTotal !== undefined && rawTotal !== null;
  const reportedTotal = Number(rawTotal) || 0;

  const cachedInput = hasReportedCache
    ? reportedCachedInput
    : hasReportedTotal
      ? Math.max(0, reportedTotal - input - output - reasoning)
      : 0;
  const total = hasReportedTotal ? reportedTotal : input + cachedInput + output + reasoning;

  return { input, cachedInput, output, reasoning, total };
}

/** Attempt count plus first-attempt outcome for one numbered task stream. */
export interface AttemptObservation {
  readonly attempts: number;
  readonly firstAttemptPass: boolean;
}

/** Counts `started` events and whether a typed `done` resolved the first attempt. */
export function observeAttempts(events: readonly Record<string, unknown>[]): AttemptObservation {
  let attempts = 0;
  let firstAttemptActive = false;
  let firstAttemptResolved = false;
  let firstAttemptPass = false;

  for (const event of events) {
    if (event.type === 'started') {
      attempts++;
      if (firstAttemptActive) {
        firstAttemptResolved = true;
        firstAttemptActive = false;
      } else if (!firstAttemptResolved) {
        firstAttemptActive = true;
      }
    } else if (event.type === 'done') {
      if (firstAttemptActive && !firstAttemptResolved) {
        firstAttemptPass = true;
        firstAttemptResolved = true;
        firstAttemptActive = false;
      }
    } else if (event.type === 'dead' || event.type === 'regressed') {
      if (firstAttemptActive && !firstAttemptResolved) {
        firstAttemptResolved = true;
        firstAttemptActive = false;
      }
    }
  }

  return { attempts, firstAttemptPass };
}

/** Pre-spawn verify runs and mismatches counted apart from verification gates. */
function recordVerifyRun(
  data: Record<string, unknown> | null,
  verifyCodes: (number | null)[],
  preSpawn: { runs: number; mismatches: number },
): void {
  if (data?.phase === 'pre_spawn') {
    preSpawn.runs++;
    if (data.mismatch === true) preSpawn.mismatches++;
    return;
  }
  const rawExit = data?.exitCode;
  verifyCodes.push(typeof rawExit === 'number' && Number.isFinite(rawExit) ? rawExit : null);
}

/** Every history-relevant observation of one numbered task event stream. */
export interface TaskStreamObservation {
  readonly attempts: number;
  readonly unexplained: number;
  readonly deadByReason: Record<string, number>;
  readonly verifyCodes: readonly (number | null)[];
  readonly preSpawnRuns: number;
  readonly preSpawnMismatches: number;
  /** Ordered finite cost values, one per reporting event, for exact sums. */
  readonly costValues: readonly number[];
  /** Attempts that contained at least one finite cost value. */
  readonly costReportedAttempts: number;
  readonly scopeDetected: number;
  readonly scopeVerificationPassed: number;
  readonly scopeVerificationFailed: number;
  readonly scopeRecertifiedByHuman: number;
  readonly scopeRequeuedForAgent: number;
}

/**
 * Projects one numbered task stream into the aggregates the report and web
 * documents both need. Scope-regression and recertification events never
 * count as execution attempts, multiple-attempt tasks, or cost coverage.
 */
export function observeTaskStream(
  events: readonly Record<string, unknown>[],
): TaskStreamObservation {
  let attempts = 0;
  let unexplained = 0;
  const deadByReason: Record<string, number> = {};
  const verifyCodes: (number | null)[] = [];
  const preSpawn = { runs: 0, mismatches: 0 };
  const costValues: number[] = [];
  let costReportedAttempts = 0;
  let scopeDetected = 0;
  let scopeVerificationPassed = 0;
  let scopeVerificationFailed = 0;
  let scopeRecertifiedByHuman = 0;
  let scopeRequeuedForAgent = 0;

  let hasPriorStarted = false;
  let gapExplained = true;
  let attemptReportedCost = false;

  for (const event of events) {
    const data = asData(event);
    const type = event.type;

    if (type === 'started') {
      attempts++;
      if (hasPriorStarted && !gapExplained) unexplained++;
      hasPriorStarted = true;
      gapExplained = false;
      attemptReportedCost = false;
    } else if (type === 'dead') {
      gapExplained = true;
      const rawReason = data?.reason;
      const reason =
        typeof rawReason === 'string' && rawReason.trim() ? rawReason.trim() : 'unknown';
      deadByReason[reason] = (deadByReason[reason] ?? 0) + 1;
    } else if (type === 'regressed') {
      gapExplained = true;
      if (data?.reason === 'scope_regression') {
        scopeDetected++;
        const rawExit = data.exitCode;
        if (typeof rawExit === 'number' && Number.isFinite(rawExit)) {
          if (rawExit === 0) scopeVerificationPassed++;
          else scopeVerificationFailed++;
        }
      }
    } else if (type === 'recertification') {
      if (data?.outcome === 'passed') scopeRecertifiedByHuman++;
      else if (data?.outcome === 'requeued') scopeRequeuedForAgent++;
    } else if (type === 'verify_ran') {
      recordVerifyRun(data, verifyCodes, preSpawn);
    }

    const rawCost = data?.cost;
    if (typeof rawCost === 'number' && Number.isFinite(rawCost)) {
      costValues.push(rawCost);
      if (hasPriorStarted && !attemptReportedCost) {
        attemptReportedCost = true;
        costReportedAttempts++;
      }
    }
  }

  return {
    attempts,
    unexplained,
    deadByReason,
    verifyCodes,
    preSpawnRuns: preSpawn.runs,
    preSpawnMismatches: preSpawn.mismatches,
    costValues,
    costReportedAttempts,
    scopeDetected,
    scopeVerificationPassed,
    scopeVerificationFailed,
    scopeRecertifiedByHuman,
    scopeRequeuedForAgent,
  };
}
