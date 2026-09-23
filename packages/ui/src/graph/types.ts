import type {
  WebCapabilityNode,
  WebChangeNode,
  WebCoverage,
  WebLocation,
} from '../../../../src/core/web/web-data-types.js';
import type { GraphFill } from './controls.js';

/** Fixed geometry for the archive graph. No number is read from configuration. */
export const GRAPH_GEOMETRY = {
  /** Minimum lane-label column; the placed width grows for longer names. */
  laneLabelWidth: 168,
  /** SVG label font size in px, used to estimate the widest capability name. */
  laneLabelFontSize: 16,
  laneHeight: 64,
  topMargin: 44,
  bottomMargin: 56,
  gutterGap: 16,
  bandGap: 40,
  nodeSpacing: 96,
  gutterSpacing: 72,
  minPlotWidth: 320,
  minBandWidth: 96,
  rightPad: 24,
} as const;

/** Rounds to two decimals so server-rendered SVG stays byte-stable. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** One horizontal capability lane, ordered by the current capability nodes. */
export interface GraphLane {
  readonly id: string;
  readonly capability: WebCapabilityNode;
  readonly index: number;
  readonly y: number;
}

/** One lane named by a change's unique writes edges. */
export interface GraphLaneTarget {
  readonly id: string;
  readonly y: number;
}

/** How one mark's fill should be drawn and read. */
export interface GraphFillValue {
  readonly mode: GraphFill;
  readonly value: number | null;
  readonly coverage: WebCoverage;
  readonly state: 'missing' | 'partial' | 'complete';
}

/** One placed change with its lane anchors and chosen fill. */
export interface GraphMark {
  readonly folderKey: string;
  readonly node: WebChangeNode;
  readonly location: WebLocation;
  readonly x: number;
  readonly y: number;
  readonly laneTargets: readonly GraphLaneTarget[];
  readonly laneIds: readonly string[];
  readonly fill: GraphFillValue;
}

/** One projected relationship path between present nodes or a lane header. */
export interface GraphRelationship {
  readonly key: string;
  readonly kind: 'depends_on' | 'reads';
  readonly from: string;
  readonly to: string;
  readonly path: string;
}

/** A labelled reserved region for active or rejected changes. */
export interface GraphBand {
  readonly start: number;
  readonly width: number;
  readonly label: string;
}

/** The complete deterministic geometry for one graph and control state. */
export interface GraphLayout {
  readonly lanes: readonly GraphLane[];
  readonly marks: readonly GraphMark[];
  readonly depends: readonly GraphRelationship[];
  readonly reads: readonly GraphRelationship[];
  readonly width: number;
  readonly height: number;
  readonly laneLabelWidth: number;
  readonly plotRight: number;
  readonly activeBand: GraphBand;
  readonly rejectedBand: GraphBand | null;
}
