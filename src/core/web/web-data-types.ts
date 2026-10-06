import type { ApprovalDigest } from '../spec/digest.js';
import type { LandView } from '../status/show-land-types.js';

/**
 * Public read-only web documents derived from the current project tree. These
 * contracts are data only: no function in this module performs I/O, caches an
 * index, or estimates a missing observation.
 */

/** Where a change folder currently lives. */
export type WebLocation = 'active' | 'archived' | 'rejected';

/** Typed selector failure consumed by the HTTP layer without string parsing. */
export type WebDataErrorKind = 'not-found' | 'ambiguous';

/** Distinguishable selector failure for absent and ambiguous changes. */
export class WebDataError extends Error {
  readonly kind: WebDataErrorKind;

  constructor(kind: WebDataErrorKind, message: string) {
    super(message);
    this.name = 'WebDataError';
    this.kind = kind;
  }
}

/** One current `openspec/specs/<id>/spec.md` capability with its full text. */
export interface WebCapabilityNode {
  readonly kind: 'capability';
  readonly id: string;
  readonly folderKey: string;
  /** Complete UTF-8 contents of the living capability spec. */
  readonly spec: string;
  /**
   * The living sidecar's group, or null when the capability has no sidecar or
   * its sidecar has a problem. Derived graph documents always set it.
   */
  readonly group?: string | null;
}

/** Token totals grouped by recorded harness and nullable model. */
export interface WebTokenGroup {
  readonly harness: string;
  readonly model: string | null;
  readonly input: number;
  readonly cachedInput: number;
  readonly output: number;
  readonly reasoning: number;
  readonly total: number;
}

/** `reported of total` coverage for one cost or pass observation. */
export interface WebCoverage {
  readonly reported: number;
  readonly total: number;
}

/**
 * One compact observation series. `cost` is null when no valid record exists;
 * it is never estimated and never a fabricated zero.
 */
export interface WebMetricObservation {
  readonly cost: number | null;
  readonly costCoverage: WebCoverage;
  readonly tokens: readonly WebTokenGroup[];
  /** Observed durations in seconds, one per covered task or session. */
  readonly durations: readonly number[];
  readonly firstAttemptPass: WebCoverage;
}

interface WebChangeNodeBase {
  readonly kind: 'change';
  /** Preserved directory basename; stable identity within its location. */
  readonly folderKey: string;
  readonly id: number | null;
  readonly slug: string;
  readonly title: string;
  readonly state: WebLocation;
  readonly created: string | null;
  readonly approved: string | null;
  readonly landed: string | null;
  readonly rejection: { readonly reason: string; readonly timestamp: string } | null;
  readonly planner: string | null;
  readonly taskCount: number;
  /**
   * Tasks with a done marker, manual done included; same derivation as
   * `osq status`. Derived graph documents always set it.
   */
  readonly doneCount?: number;
  readonly attempts: number;
  readonly execution: WebMetricObservation;
  readonly planning: WebMetricObservation;
}

/** One change folder projected for the archive graph. */
export type WebChangeNode = WebChangeNodeBase;

export type WebEdgeKind = 'depends_on' | 'reads' | 'writes';

/** One typed relationship between a change and a change or capability. */
export interface WebGraphEdge {
  readonly key: string;
  readonly kind: WebEdgeKind;
  readonly from: string;
  readonly to: string;
}

/** Deterministically ordered capability/change nodes plus typed edges. */
export interface WebGraph {
  readonly capabilities: readonly WebCapabilityNode[];
  readonly changes: readonly WebChangeNode[];
  readonly edges: readonly WebGraphEdge[];
}

/** One resolved scope declaration with its readable path when it exists. */
export interface WebResolvedScope {
  readonly relativePath: string;
  readonly absolutePath: string | null;
}

/** Attribution for one differing path in a human recertification. */
export interface WebRecertificationAttribution {
  readonly path: string;
  readonly attribution: string;
}

/** One typed human recertification decision. */
export interface WebRecertification {
  readonly taskNumber: string;
  readonly timestamp: string | null;
  readonly outcome: 'passed' | 'requeued' | null;
  readonly actor: 'human';
  readonly differingPaths: readonly string[];
  readonly attribution: readonly WebRecertificationAttribution[];
  readonly verify: string | null;
  readonly exitCode: number | null;
  readonly timedOut: boolean | null;
}

/** One task in a detailed change document. */
export interface WebTask {
  readonly taskNumber: string;
  readonly title: string;
  readonly declaredScope: readonly string[];
  readonly resolvedScope: readonly WebResolvedScope[];
  readonly acceptance: readonly string[];
  readonly verify: string;
  readonly state: string;
  readonly attempts: number;
  readonly reason: string | null;
  readonly runningStart: string | null;
  readonly runningElapsedSeconds: number | null;
  readonly duration: number | null;
  readonly cost: number | null;
  readonly costCoverage: WebCoverage;
  readonly recertifications: readonly WebRecertification[];
  readonly result: string | null;
}

export type WebDeltaOperation = 'added' | 'modified' | 'removed' | 'renamed';

/** One delta requirement beside the living requirement it replaces. */
export interface WebDeltaRequirement {
  readonly operation: WebDeltaOperation;
  /** The requirement's name; the new name for a rename. */
  readonly name: string;
  /** The old name for a rename; null otherwise. */
  readonly from: string | null;
  /** The delta's verbatim block for added and modified; null otherwise. */
  readonly proposed: string | null;
  /** The living block `osq spec` prints; null for added or when none matches. */
  readonly living: string | null;
}

/** One capability folder of a change's delta specs. */
export interface WebDeltaCapability {
  readonly capability: string;
  readonly requirements: readonly WebDeltaRequirement[];
}

/** What a reviewer reads before approving an unapproved change. */
export interface WebReview {
  readonly goal: string;
  readonly nonGoals: string;
  readonly surface: string;
  readonly decisions: string;
  readonly humanSteps: string;
  readonly contract: string;
  readonly deltas: readonly WebDeltaCapability[];
  readonly digest: ApprovalDigest;
  readonly digestText: string;
}

/** One unambiguous change with its proposal, brief, and task detail. */
export interface WebChange {
  readonly folderKey: string;
  readonly id: number | null;
  readonly slug: string;
  readonly title: string;
  readonly state: WebLocation;
  readonly location: WebLocation;
  readonly planner: string | null;
  readonly brief: string | null;
  readonly goal: string;
  readonly rejection: { readonly reason: string; readonly timestamp: string } | null;
  readonly dependsOn: readonly string[];
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  /** Derivation timestamp supplied by the caller. */
  readonly asOf: string;
  readonly tasks: readonly WebTask[];
  /**
   * The approve review for an active change without `.run/approved`, else
   * null. Optional so documents built before this field stay valid; a missing
   * value reads the same as null.
   */
  readonly review?: WebReview | null;
  /**
   * The land view of an archived change, else null. Optional so documents
   * built before this field stay valid; a missing value reads the same as null.
   */
  readonly land?: LandView | null;
}
