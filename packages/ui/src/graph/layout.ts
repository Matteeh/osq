import type { WebChangeNode, WebGraph, WebLocation } from '../../../../src/core/web-data-types.js';
import type { GraphControls } from './controls.js';
import { fillValue } from './fill.js';
import { projectRelationships } from './relationships.js';
import {
  GRAPH_GEOMETRY,
  type GraphLane,
  type GraphLaneTarget,
  type GraphLayout,
  type GraphMark,
  round,
} from './types.js';

/** Archived changes with a valid recorded landed time, sorted by time then key. */
export function orderedArchived(
  graph: WebGraph,
): { readonly node: WebChangeNode; readonly landedMs: number }[] {
  const archived: { node: WebChangeNode; landedMs: number }[] = [];
  for (const node of graph.changes) {
    if (node.state !== 'archived' || node.landed === null) continue;
    const landedMs = Date.parse(node.landed);
    if (Number.isFinite(landedMs)) archived.push({ node, landedMs });
  }
  return archived.sort(
    (a, b) => a.landedMs - b.landedMs || a.node.folderKey.localeCompare(b.node.folderKey),
  );
}

function uniqueWrites(graph: WebGraph): Map<string, string[]> {
  const targets = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'writes') continue;
    const list = targets.get(edge.from) ?? [];
    if (!list.includes(edge.to)) list.push(edge.to);
    targets.set(edge.from, list);
  }
  return targets;
}

function byFolderKey(a: WebChangeNode, b: WebChangeNode): number {
  return a.folderKey.localeCompare(b.folderKey);
}

/**
 * Project the current graph and control state into deterministic geometry. The
 * graph document is treated as immutable: only new arrays and plain objects are
 * returned. Current capability nodes establish lane order; a writes edge to an
 * absent capability is ignored rather than growing a synthetic lane.
 */
export function graphLayout(graph: WebGraph, controls: GraphControls): GraphLayout {
  const geometry = GRAPH_GEOMETRY;
  const lanes: GraphLane[] = graph.capabilities.map((capability, index) => ({
    id: capability.id,
    capability,
    index,
    y: geometry.topMargin + index * geometry.laneHeight + geometry.laneHeight / 2,
  }));
  const laneById = new Map(lanes.map((lane) => [lane.id, lane]));

  const writes = uniqueWrites(graph);
  const laneTargets = (folderKey: string): GraphLaneTarget[] => {
    const found: GraphLaneTarget[] = [];
    for (const id of writes.get(folderKey) ?? []) {
      const lane = laneById.get(id);
      if (lane !== undefined) found.push({ id: lane.id, y: lane.y });
    }
    return found.sort((a, b) => a.y - b.y);
  };

  const archived = orderedArchived(graph);
  const activeNodes = graph.changes.filter((node) => node.state === 'active').sort(byFolderKey);
  const rejectedNodes = graph.changes.filter((node) => node.state === 'rejected').sort(byFolderKey);
  const placedNodes = [
    ...archived.map((entry) => entry.node),
    ...activeNodes,
    ...(controls.rejectedVisible ? rejectedNodes : []),
  ];
  const laneBottom =
    lanes.length > 0 ? (lanes[lanes.length - 1]?.y ?? geometry.topMargin) : geometry.topMargin;
  const hasUnmapped = placedNodes.some((node) => laneTargets(node.folderKey).length === 0);
  const unmappedY = laneBottom + geometry.laneHeight / 2;

  const plotInner = Math.max(geometry.minPlotWidth, archived.length * geometry.nodeSpacing);
  const plotLeft = geometry.laneLabelWidth + geometry.gutterGap;
  const plotRight = plotLeft + plotInner;
  const innerLeft = plotLeft + geometry.nodeSpacing / 2;
  const innerRight = plotRight - geometry.nodeSpacing / 2;
  const first = archived[0];
  const last = archived[archived.length - 1];
  const tMin = first?.landedMs ?? 0;
  const tMax = last?.landedMs ?? 0;
  const baseX = (ms: number): number =>
    tMax <= tMin
      ? (innerLeft + innerRight) / 2
      : innerLeft + ((ms - tMin) / (tMax - tMin)) * (innerRight - innerLeft);

  const activeStart = plotRight + geometry.bandGap;
  const activeWidth = Math.max(activeNodes.length * geometry.gutterSpacing, geometry.minBandWidth);
  const rejectedStart = activeStart + activeWidth + geometry.bandGap;

  const marks: GraphMark[] = [];
  const makeMark = (node: WebChangeNode, location: WebLocation, x: number): void => {
    const targets = laneTargets(node.folderKey);
    const top = targets[0]?.y ?? 0;
    const bottom = targets[targets.length - 1]?.y ?? 0;
    marks.push({
      folderKey: node.folderKey,
      node,
      location,
      x,
      y: targets.length > 0 ? (top + bottom) / 2 : unmappedY,
      laneTargets: targets,
      laneIds: targets.map((target) => target.id),
      fill: fillValue(node, controls.fill),
    });
  };

  let previousBase: number | null = null;
  let ordinal = 0;
  for (const entry of archived) {
    const base = baseX(entry.landedMs);
    ordinal = previousBase !== null && base === previousBase ? ordinal + 1 : 0;
    previousBase = base;
    makeMark(entry.node, 'archived', base + ordinal * geometry.overlapOffset);
  }
  activeNodes.forEach((node, index) => {
    makeMark(
      node,
      'active',
      activeStart + geometry.gutterSpacing / 2 + index * geometry.gutterSpacing,
    );
  });
  if (controls.rejectedVisible) {
    rejectedNodes.forEach((node, index) => {
      makeMark(
        node,
        'rejected',
        rejectedStart + geometry.gutterSpacing / 2 + index * geometry.gutterSpacing,
      );
    });
  }

  const { depends, reads } = projectRelationships(graph, controls, marks, lanes);

  const rejectedVisible = controls.rejectedVisible && rejectedNodes.length > 0;
  const width = rejectedVisible
    ? rejectedStart + rejectedNodes.length * geometry.gutterSpacing + geometry.rightPad
    : activeStart + activeWidth + geometry.rightPad;
  const contentBottom = hasUnmapped ? unmappedY + geometry.laneHeight / 2 : laneBottom;
  const height = contentBottom + geometry.bottomMargin;

  return {
    lanes,
    marks,
    depends,
    reads,
    width: round(width),
    height: round(height),
    laneLabelWidth: geometry.laneLabelWidth,
    plotRight: round(plotRight),
    activeBand: { start: round(activeStart), width: round(activeWidth), label: 'Active changes' },
    rejectedBand: rejectedVisible
      ? {
          start: round(rejectedStart),
          width: round(rejectedNodes.length * geometry.gutterSpacing),
          label: 'Rejected changes',
        }
      : null,
  };
}
