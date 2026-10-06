/**
 * Public read-only web inspection entrypoints. Both derive every document from
 * the current project tree, store no index, and estimate no absent evidence.
 */
export { getWebGraph } from './web-data-graph.js';
export { getWebChange } from './web-data-change.js';
export { WebDataError } from './web-data-types.js';
export type { WebDataErrorKind } from './web-data-types.js';
export type {
  LandDisclosure,
  LandGate,
  LandGateKind,
  LandView,
} from '../status/show-land-types.js';
export type {
  WebCapabilityNode,
  WebChange,
  WebChangeNode,
  WebCoverage,
  WebDeltaCapability,
  WebDeltaOperation,
  WebDeltaRequirement,
  WebEdgeKind,
  WebGraph,
  WebGraphEdge,
  WebLocation,
  WebMetricObservation,
  WebRecertification,
  WebRecertificationAttribution,
  WebResolvedScope,
  WebReview,
  WebTask,
  WebTokenGroup,
} from './web-data-types.js';
