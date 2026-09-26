/**
 * Scope-regression detection and recertification counting for one numbered task
 * stream, derived only from typed `regressed` and `recertification` events.
 */

/** Counts for the report's `scopeRegressions` history block. */
export interface ScopeRegressionCounts {
  readonly detected: number;
  readonly verificationPassedAtDetection: number;
  readonly verificationFailedAtDetection: number;
  readonly recertifiedByHuman: number;
  readonly recertifiedAutomatically: number;
  readonly requeuedForAgent: number;
}

/** The typed `data` object of an event, or null when absent or malformed. */
function eventData(event: Record<string, unknown>): Record<string, unknown> | null {
  const data = event.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

/**
 * Counts scope-regression detections, classifying finite detection exit codes
 * and splitting passed recertifications by automatic and human origin. A
 * missing or malformed outcome field is never guessed; only an exact
 * `automatic: true` marks an automatic pass.
 */
export function observeScopeRegression(
  events: readonly Record<string, unknown>[],
): ScopeRegressionCounts {
  let detected = 0;
  let verificationPassedAtDetection = 0;
  let verificationFailedAtDetection = 0;
  let recertifiedByHuman = 0;
  let recertifiedAutomatically = 0;
  let requeuedForAgent = 0;

  for (const event of events) {
    const data = eventData(event);
    if (event.type === 'regressed') {
      if (data?.reason !== 'scope_regression') continue;
      detected++;
      const rawExit = data?.exitCode;
      if (typeof rawExit === 'number' && Number.isFinite(rawExit)) {
        if (rawExit === 0) verificationPassedAtDetection++;
        else verificationFailedAtDetection++;
      }
    } else if (event.type === 'recertification') {
      if (data?.outcome === 'passed') {
        if (data?.automatic === true) recertifiedAutomatically++;
        else recertifiedByHuman++;
      } else if (data?.outcome === 'requeued') {
        requeuedForAgent++;
      }
    }
  }

  return {
    detected,
    verificationPassedAtDetection,
    verificationFailedAtDetection,
    recertifiedByHuman,
    recertifiedAutomatically,
    requeuedForAgent,
  };
}
