import type { WebCoverage } from '../../../../src/core/web/web-data-types.js';

/** The single explicit label for absent or non-finite evidence. */
export const UNAVAILABLE = 'unavailable';

/** A non-negative cost, or the explicit unavailable label. */
export function formatCost(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return UNAVAILABLE;
  return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

/** A finite non-negative count, or the explicit unavailable label. */
export function formatCount(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNAVAILABLE;
  return String(Math.trunc(value));
}

/** A finite non-negative number of seconds, or the explicit unavailable label. */
export function formatSeconds(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return UNAVAILABLE;
  return `${Math.round(value)}s`;
}

/** An ISO timestamp, or the explicit unavailable label. */
export function formatTimestamp(value: string | null): string {
  return value === null || value.length === 0 ? UNAVAILABLE : value;
}

/** A nullable planner attribution, never inferred from configuration. */
export function plannerLabel(planner: string | null): string {
  return planner === null || planner.trim() === '' ? UNAVAILABLE : planner;
}

/** A verification exit code, or the explicit unavailable label. */
export function formatExitCode(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return UNAVAILABLE;
  return String(Math.trunc(value));
}

/** A nullable timeout flag as explicit evidence. */
export function formatTimeout(value: boolean | null): string {
  if (value === null) return UNAVAILABLE;
  return value ? 'timed out' : 'no timeout';
}

/** The server's `reported of total` coverage counts. */
export function coverageText(coverage: WebCoverage): string {
  return `${formatCount(coverage.reported)} of ${formatCount(coverage.total)}`;
}

/** A cost value with its exact coverage immediately beside it. */
export function costWithCoverage(value: number | null, coverage: WebCoverage): string {
  return `${formatCost(value)} (${coverageText(coverage)} attempts reported)`;
}

/** The server-derived running start and elapsed seconds, never a client timer. */
export function runningDescription(task: {
  readonly state: string;
  readonly runningStart: string | null;
  readonly runningElapsedSeconds: number | null;
}): string | null {
  if (task.state !== 'running') return null;
  const started = formatTimestamp(task.runningStart);
  const elapsed = formatSeconds(task.runningElapsedSeconds);
  return `running since ${started}, ${elapsed} elapsed`;
}
