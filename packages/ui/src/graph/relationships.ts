import type { WebGraph } from '../../../../src/core/web/web-data-types.js';
import type { GraphControls } from './controls.js';
import {
  GRAPH_GEOMETRY,
  type GraphLane,
  type GraphMark,
  type GraphRelationship,
  round,
} from './types.js';

function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`;
}

/**
 * Project dependency relationships between present change marks and reads
 * relationships from present marks to current capability lane headers. Each
 * layer is omitted when its independent visibility control is off.
 */
export function projectRelationships(
  graph: WebGraph,
  controls: GraphControls,
  marks: readonly GraphMark[],
  lanes: readonly GraphLane[],
): { depends: GraphRelationship[]; reads: GraphRelationship[] } {
  const markByKey = new Map(marks.map((mark) => [mark.folderKey, mark]));
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));

  const depends: GraphRelationship[] = [];
  const reads: GraphRelationship[] = [];
  if (controls.dependsVisible) {
    for (const edge of graph.edges) {
      if (edge.kind !== 'depends_on') continue;
      const from = markByKey.get(edge.from);
      const to = markByKey.get(edge.to);
      if (from === undefined || to === undefined) continue;
      depends.push({
        key: edge.key,
        kind: 'depends_on',
        from: from.folderKey,
        to: to.folderKey,
        path: linePath(from.x, from.y, to.x, to.y),
      });
    }
    depends.sort((a, b) => a.key.localeCompare(b.key));
  }
  if (controls.readsVisible) {
    for (const edge of graph.edges) {
      if (edge.kind !== 'reads') continue;
      const from = markByKey.get(edge.from);
      const lane = laneById.get(edge.to);
      if (from === undefined || lane === undefined) continue;
      reads.push({
        key: edge.key,
        kind: 'reads',
        from: from.folderKey,
        to: lane.id,
        path: linePath(from.x, from.y, GRAPH_GEOMETRY.laneLabelWidth, lane.y),
      });
    }
    reads.sort((a, b) => a.key.localeCompare(b.key));
  }
  return { depends, reads };
}
