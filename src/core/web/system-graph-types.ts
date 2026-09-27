/**
 * The versioned, read-only system graph document: nodes and edges derived from
 * the current project tree. Data only: no function in this module performs I/O,
 * caches an index, or carries a layout or position.
 */

import type { OsqConfig } from '../foundation/config.js';
import type { Adr } from '../foundation/decisions.js';
import type { CapabilityMutationScore, MutationSurvivorEntry } from '../report/report-mutation.js';
import type { ScenarioOutcome } from '../spec/delta.js';
import type { ScenarioIndex } from '../trace/scenario-index.js';
import type { WebLocation } from './web-data-types.js';

/** The only supported system graph document version. */
export type SystemGraphVersion = 1;

/** Assigns a final node id, suffixing `~2`, `~3`, ... on collisions. */
export type SystemGraphIdAllocator = (base: string) => string;

/** One `group` node: a group some capability sidecar names. */
export interface SystemGroupNode {
  readonly kind: 'group';
  readonly id: string;
  readonly name: string;
}

/** An opted-in capability's untested-scenario and unclaimed-function counts. */
export interface SystemCapabilityGaps {
  readonly untested: number;
  readonly unclaimed: number;
}

/** One `capability` node from a living spec and its sidecar. */
export interface SystemCapabilityNode {
  readonly kind: 'capability';
  readonly id: string;
  readonly name: string;
  /** The living sidecar's group, or null. */
  readonly group: string | null;
  /** The living spec's Purpose text. */
  readonly purpose: string;
  /** Whether the capability is opted into traceability. */
  readonly traceability: boolean;
  /** Gap counts for an opted-in capability, or null. */
  readonly gaps: SystemCapabilityGaps | null;
}

/** One `requirement` node of a living spec. */
export interface SystemRequirementNode {
  readonly kind: 'requirement';
  readonly id: string;
  readonly capability: string;
  readonly name: string;
  /** The requirement body before its first scenario, trimmed. */
  readonly text: string;
}

/** One `scenario` node of a living requirement. */
export interface SystemScenarioNode {
  readonly kind: 'scenario';
  readonly id: string;
  readonly capability: string;
  readonly requirement: string;
  readonly name: string;
  readonly when: readonly string[];
  readonly outcomes: readonly ScenarioOutcome[];
  readonly gap: string | null;
}

/** One `adr` node as `readDecisions` reads it. */
export interface SystemAdrNode {
  readonly kind: 'adr';
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly appliesTo: Adr['appliesTo'];
  readonly rule: string;
  readonly path: string;
}

/** One `change` node as the `WebGraph` change node holds it. */
export interface SystemChangeNode {
  readonly kind: 'change';
  readonly id: string;
  readonly folderKey: string;
  readonly number: number | null;
  readonly title: string;
  readonly state: WebLocation;
  readonly landed: string | null;
}

/** One `test` node for a scenario test file. */
export interface SystemTestNode {
  readonly kind: 'test';
  readonly id: string;
  readonly file: string;
}

/** One `function` node for an exported function. */
export interface SystemFunctionNode {
  readonly kind: 'function';
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly name: string;
  /** `@scenario` tags written `<capability>: <name>`. */
  readonly scenarios: readonly string[];
  /** `@adr` numbers. */
  readonly adrs: readonly string[];
  readonly survivors: readonly MutationSurvivorEntry[];
  readonly gap: string | null;
}

/** One `file` node for an unowned file of the import graph. */
export interface SystemFileNode {
  readonly kind: 'file';
  readonly id: string;
  readonly path: string;
  readonly gap: string | null;
}

/** Any system graph node. */
export type SystemGraphNode =
  | SystemGroupNode
  | SystemCapabilityNode
  | SystemRequirementNode
  | SystemScenarioNode
  | SystemAdrNode
  | SystemChangeNode
  | SystemTestNode
  | SystemFunctionNode
  | SystemFileNode;

/** Every system graph edge kind, in document order for summaries. */
export type SystemEdgeKind =
  | 'contains'
  | 'applies_to'
  | 'reads'
  | 'writes'
  | 'imports'
  | 'owns'
  | 'proves'
  | 'covers'
  | 'serves'
  | 'follows';

/** One `{ from, to }` file pair behind an `imports` edge. */
export interface SystemGraphFilePair {
  readonly from: string;
  readonly to: string;
}

/** One typed relationship between two system graph nodes. */
export interface SystemGraphEdge {
  readonly key: string;
  readonly kind: SystemEdgeKind;
  readonly from: string;
  readonly to: string;
  /** Import pairs, present on `imports` edges only. */
  readonly pairs?: readonly SystemGraphFilePair[];
  /** Pairs whose importing file is not a test path. */
  readonly code?: number;
  /** Pairs whose importing file is a test path. */
  readonly test?: number;
}

/** A deterministically ordered system graph document. */
export interface SystemGraph {
  readonly version: SystemGraphVersion;
  readonly nodes: readonly SystemGraphNode[];
  readonly edges: readonly SystemGraphEdge[];
}

/** The nodes and edges one graph builder contributes. */
export interface SystemGraphPart {
  readonly nodes: readonly SystemGraphNode[];
  readonly edges: readonly SystemGraphEdge[];
}

/**
 * The traceability part's nodes, edges, and the gap state it applies to the
 * spec nodes already built. `gaps` names every opted-in capability with a
 * living spec; `scenarioGaps` names each scenario node id with a gap.
 */
export interface SystemGraphTracePart extends SystemGraphPart {
  readonly gaps: ReadonlyMap<string, SystemCapabilityGaps>;
  readonly scenarioGaps: ReadonlyMap<string, string>;
}

/** Everything `buildSystemGraphTrace` reads from the caller and the project. */
export interface SystemGraphTraceInput {
  readonly projectRoot: string;
  readonly config: OsqConfig;
  readonly index: ScenarioIndex;
  readonly specNodes: readonly SystemGraphNode[];
  readonly mutationScores: readonly CapabilityMutationScore[] | undefined;
  readonly allocateId: SystemGraphIdAllocator;
}

/** Nodes of one kind with the id allocated to each source key. */
export interface SystemGraphNodeSet<T> {
  readonly nodes: readonly T[];
  readonly ids: ReadonlyMap<string, string>;
}
