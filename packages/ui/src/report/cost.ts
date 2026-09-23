import type { WebCoverage, WebGraph } from '../../../../src/core/web/web-data-types.js';

/** One archived change on the cost chart, whether or not it has a landed time. */
export interface CostChange {
  readonly folderKey: string;
  readonly id: number | null;
  readonly slug: string;
  readonly landed: string | null;
  readonly executionCost: number | null;
  readonly executionCoverage: WebCoverage;
  readonly planningCost: number | null;
  readonly planningCoverage: WebCoverage;
}

function finiteNonNegative(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The change number of a node, from its id when present and its key otherwise. */
function changeNumber(node: { readonly id: number | null; readonly folderKey: string }): number {
  if (node.id !== null && Number.isFinite(node.id)) return node.id;
  const match = node.folderKey.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

/**
 * Every archived change for the horizontal cost chart, ascending by change
 * number and including one without a recorded landed time. Active and rejected
 * nodes never carry landed delivery cost.
 */
export function costChanges(graph: WebGraph): CostChange[] {
  return graph.changes
    .filter((node) => node.state === 'archived')
    .map((node) => ({
      folderKey: node.folderKey,
      id: node.id,
      slug: node.slug,
      landed: node.landed,
      executionCost: finiteNonNegative(node.execution.cost),
      executionCoverage: node.execution.costCoverage,
      planningCost: finiteNonNegative(node.planning.cost),
      planningCoverage: node.planning.costCoverage,
    }))
    .sort((a, b) => changeNumber(a) - changeNumber(b) || a.folderKey.localeCompare(b.folderKey));
}
