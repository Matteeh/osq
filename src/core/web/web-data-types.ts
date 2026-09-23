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
}
