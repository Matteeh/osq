import type { WebChangeNode, WebCoverage } from '../../../../src/core/web-data-types.js';
import type { GraphFill } from './controls.js';
import type { GraphFillValue } from './types.js';

function finite(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumCoverage(a: WebCoverage, b: WebCoverage): WebCoverage {
  return { reported: a.reported + b.reported, total: a.total + b.total };
}

/**
 * The single fill projection. Attempts come straight from the node. Cost is the
 * sum of the non-null execution and planning observations with their summed
 * denominators; a missing planning record never contributes a fabricated zero.
 */
export function fillValue(node: WebChangeNode, mode: GraphFill): GraphFillValue {
  if (mode === 'attempts') {
    const attempts = Number.isFinite(node.attempts) ? Math.max(0, node.attempts) : 0;
    return {
      mode,
      value: attempts,
      coverage: { reported: attempts, total: attempts },
      state: attempts > 0 ? 'complete' : 'missing',
    };
  }
  const execution = finite(node.execution.cost);
  const planning = finite(node.planning.cost);
  const value = execution === null && planning === null ? null : (execution ?? 0) + (planning ?? 0);
  const coverage = sumCoverage(node.execution.costCoverage, node.planning.costCoverage);
  const state =
    value === null
      ? 'missing'
      : coverage.total > 0 && coverage.reported < coverage.total
        ? 'partial'
        : 'complete';
  return { mode, value, coverage, state };
}
