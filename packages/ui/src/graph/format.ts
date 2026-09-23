import type { WebCoverage } from '../../../../src/core/web/web-data-types.js';
import { formatCost } from '../format.js';
import type { GraphFillValue, GraphMark } from './types.js';

export { formatCost };

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
  return `cost ${formatCost(fill.value, fill.coverage)} (${coverageText(fill.coverage)} attempts and sessions reported)`;
}

/**
 * The pointer title and keyboard-focus label for one mark. It always states
 * title, date, planner, task count, attempts, the exact fill value and
 * coverage, and every capability the change writes.
 */
export function markAriaLabel(mark: GraphMark): string {
  const node = mark.node;
  const landed = node.landed === null ? 'landed date not recorded' : `landed date ${node.landed}`;
  const writes = mark.laneIds.length > 0 ? mark.laneIds.join(', ') : 'no current capability';
  return [
    node.title,
    landed,
    `planner ${node.planner ?? 'unavailable'}`,
    `tasks ${formatCount(node.taskCount)}`,
    `attempts ${formatCount(node.attempts)}`,
    fillDescription(mark.fill),
    `writes ${writes}`,
    `activate to open ${mark.folderKey}`,
  ].join('; ');
}
