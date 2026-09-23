import type {
  WebChangeNode,
  WebGraph,
  WebLocation,
} from '../../../../src/core/web/web-data-types.js';
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

/** A change's number, from its id when present and its key's numeric prefix otherwise. */
function changeNumber(node: WebChangeNode): number {
  if (node.id !== null && Number.isFinite(node.id)) return node.id;
  const match = node.folderKey.match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

/**
 * Every archived change ordered left to right by change number, including one
 * with no recorded landed time, tied by folder key.
 */
export function orderedArchived(graph: WebGraph): WebChangeNode[] {
  return graph.changes
    .filter((node) => node.state === 'archived')
    .sort((a, b) => changeNumber(a) - changeNumber(b) || a.folderKey.localeCompare(b.folderKey));
}

/** The average glyph width as a fraction of the label font size in the system stack. */
const LABEL_CHAR_EM = 0.62;

/** The lane label column: wide enough for the longest capability name, or the minimum. */
function laneLabelWidth(capabilityIds: readonly string[]): number {
  const longest = capabilityIds.reduce((max, id) => Math.max(max, id.length), 0);
  const estimate = Math.ceil(longest * GRAPH_GEOMETRY.laneLabelFontSize * LABEL_CHAR_EM) + 24;
  return Math.max(GRAPH_GEOMETRY.laneLabelWidth, estimate);
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
    ...archived,
    ...activeNodes,
    ...(controls.rejectedVisible ? rejectedNodes : []),
  ];
  const laneBottom =
    lanes.length > 0 ? (lanes[lanes.length - 1]?.y ?? geometry.topMargin) : geometry.topMargin;
  const hasUnmapped = placedNodes.some((node) => laneTargets(node.folderKey).length === 0);
  const unmappedY = laneBottom + geometry.laneHeight / 2;

  const labelWidth = round(laneLabelWidth(graph.capabilities.map((node) => node.id)));
  const plotInner = Math.max(geometry.minPlotWidth, archived.length * geometry.nodeSpacing);
  const plotLeft = labelWidth + geometry.gutterGap;
  const plotRight = plotLeft + plotInner;
  const innerLeft = plotLeft + geometry.nodeSpacing / 2;
  const innerRight = plotRight - geometry.nodeSpacing / 2;
  const baseX = (index: number): number =>
    archived.length <= 1
      ? (innerLeft + innerRight) / 2
      : innerLeft + (index / (archived.length - 1)) * (innerRight - innerLeft);

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

  archived.forEach((node, index) => {
    makeMark(node, 'archived', baseX(index));
  });
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

  const { depends, reads } = projectRelationships(graph, controls, marks, lanes, labelWidth);

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
    laneLabelWidth: labelWidth,
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
