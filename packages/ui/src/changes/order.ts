import type { WebGraph } from '../contracts.js';

type WebChangeNode = WebGraph['changes'][number];

function compareDescending(a: WebChangeNode, b: WebChangeNode): number {
  if (a.id === null && b.id === null) return b.folderKey.localeCompare(a.folderKey);
  if (a.id === null) return 1;
  if (b.id === null) return -1;
  return b.id - a.id;
}

/** Active nodes first, then the rest, each group by descending numeric id. */
export function orderChangeNodes(changes: readonly WebChangeNode[]): WebChangeNode[] {
  const active = changes.filter((node) => node.state === 'active').sort(compareDescending);
  const rest = changes.filter((node) => node.state !== 'active').sort(compareDescending);
  return [...active, ...rest];
}
