import type { WebGraph } from '../contracts.js';

type WebChangeNode = WebGraph['changes'][number];

/** A change node's row state, splitting active changes by approval. */
export function changeStateLabel(node: WebChangeNode): string {
  if (node.state === 'archived') return 'archived';
  if (node.state === 'rejected') return 'rejected';
  return node.approved === null ? 'awaiting approval' : 'in progress';
}
