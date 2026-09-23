import type { WebCoverage } from '../../../src/core/web/web-data-types.js';

/** The one explicit label for a cost no attempt or session reported. */
export const NOT_REPORTED = 'not reported';

/**
 * The one cost formatter for the dashboard. A null, non-finite, or negative
 * value, or a coverage that reported nothing, reads `not reported`; otherwise
 * the value keeps the established dollar text. Coverage is optional because an
 * axis tick carries no recorded denominator.
 */
export function formatCost(value: number | null, coverage?: WebCoverage): string {
  if (value === null || !Number.isFinite(value) || value < 0 || coverage?.reported === 0) {
    return NOT_REPORTED;
  }
  return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}
