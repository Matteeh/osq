import type { WebCoverage } from '../../../../src/core/web/web-data-types.js';
import type { GraphFillValue, GraphMark } from './types.js';

/** A cost value, or explicit `unavailable` when no finite observation exists. */
export function formatCost(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'unavailable';
  return value >= 0.01 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

/** A whole count, or `unavailable` for a non-finite value. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? String(Math.trunc(value)) : 'unavailable';
}

/** `reported of total` coverage text. */
export function coverageText(coverage: WebCoverage): string {
  return `${formatCount(coverage.reported)} of ${formatCount(coverage.total)}`;
}

/** The exact value and coverage for one mark's current fill mode. */
export function fillDescription(fill: GraphFillValue): string {
  if (fill.mode === 'attempts') return `${formatCount(fill.value ?? 0)} attempts`;
  return `cost ${formatCost(fill.value)} (${coverageText(fill.coverage)} attempts and sessions reported)`;
}

/**
 * The pointer title and keyboard-focus label for one mark. It always states
 * title, date, planner, task count, attempts, the exact fill value and
 * coverage, and every capability the change writes.
 */
export function markAriaLabel(mark: GraphMark): string {
  const node = mark.node;
  const date = node.landed ?? node.created ?? 'unavailable';
  const writes = mark.laneIds.length > 0 ? mark.laneIds.join(', ') : 'no current capability';
  return [
    node.title,
    `date ${date}`,
    `planner ${node.planner ?? 'unavailable'}`,
    `tasks ${formatCount(node.taskCount)}`,
    `attempts ${formatCount(node.attempts)}`,
    fillDescription(mark.fill),
    `writes ${writes}`,
    `activate to open ${mark.folderKey}`,
  ].join('; ');
}
