import type { WebCoverage } from '../../../../src/core/web-data-types.js';
import { round } from './scales.js';

/** Reported cost, or explicit `unavailable` when there is no finite value. */
export function formatCost(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'unavailable';
  return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

/** A whole non-negative count, or `unavailable` for a non-finite value. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? String(Math.trunc(value)) : 'unavailable';
}

/** A 0..1 ratio as a percentage, or `unavailable` when absent. */
export function formatPercent(value: number | null, digits = 0): string {
  if (value === null || !Number.isFinite(value)) return 'unavailable';
  return `${(value * 100).toFixed(digits)}%`;
}

/** A rate from a reported/total pair, or `unavailable` for no denominator. */
export function formatRate(reported: number, total: number): string {
  if (!Number.isFinite(total) || total <= 0) return 'unavailable';
  return formatPercent(reported / total);
}

/** Seconds in a compact human form, or `unavailable` when absent. */
export function formatDurationSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'unavailable';
  if (seconds < 60) return `${round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds - minutes * 60);
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

/** The date portion of an ISO timestamp without locale or clock formatting. */
export function formatLanded(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

/** `reported of total` coverage text. */
export function coverageText(coverage: WebCoverage): string {
  return `${formatCount(coverage.reported)} of ${formatCount(coverage.total)}`;
}

/** A cost value immediately followed by its exact reported-of-total coverage. */
export function costWithCoverage(
  value: number | null,
  coverage: WebCoverage,
  unit: string,
): string {
  return `${formatCost(value)} (${coverageText(coverage)} ${unit} reported)`;
}

/** A compact adjacent cost and coverage label for an SVG mark. */
export function compactCost(value: number, coverage: WebCoverage): string {
  return `${formatCost(value)} (${formatCount(coverage.reported)}/${formatCount(coverage.total)})`;
}

/** A nullable model rendered as an explicit unavailable label. */
export function modelLabel(model: string | null): string {
  return model === null || model.trim() === '' ? 'model unavailable' : model;
}
