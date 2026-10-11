/**
 * The docs page models: one page per living capability, one per ADR, the
 * groups that order capabilities, and the site that holds them. Data only:
 * every reader builds these types and the Markdown and dashboard render them.
 */

import type { Adr } from '../core/foundation/decisions.js';

/** The resolved `docs` config block. */
export interface DocsConfig {
  /** The most archived changes a capability page lists. */
  readonly recentChanges: number;
}

/** One requirement of a capability page, with its SHALL sentence and scenarios. */
export interface CapabilityPageRequirement {
  readonly name: string;
  readonly scenarios: readonly string[];
  readonly shall: string;
}

/** One accepted ADR binding a capability. */
export interface CapabilityPageDecision {
  readonly number: string;
  readonly title: string;
  readonly rule: string;
  readonly appliesToAll: boolean;
}

/** One function the graph ties to a scenario. */
export interface CodeMapFunction {
  readonly file: string;
  readonly line: number;
  readonly name: string;
}

/** One scenario's code map entry: its functions and proving tests. */
export interface CodeMapEntry {
  readonly requirement: string;
  readonly scenario: string;
  readonly functions: readonly CodeMapFunction[];
  readonly tests: readonly string[];
}

/** One archived change that touched a capability. */
export interface CapabilityRecentChange {
  readonly id: string;
  readonly folder: string;
  readonly archivedOn: string | null;
  readonly goal: string;
}

/** One capability's page model. */
export interface CapabilityPage {
  readonly name: string;
  readonly group: string | null;
  readonly purpose: string;
  readonly requirements: readonly CapabilityPageRequirement[];
  readonly decisions: readonly CapabilityPageDecision[];
  readonly ownership: readonly string[];
  /** Null unless the capability is opted in to traceability. */
  readonly codeMap: readonly CodeMapEntry[] | null;
  readonly recentChanges: readonly CapabilityRecentChange[];
}

/** One ADR's page model. */
export interface AdrPage {
  readonly number: string;
  readonly title: string;
  readonly status: string;
  readonly date: string | null;
  readonly path: string;
  readonly rule: string;
  readonly appliesTo: Adr['appliesTo'];
  readonly supersededBy: string | null;
  readonly capabilities: readonly string[];
  readonly body: string;
}

/** One group of capability names, in order. */
export interface DocsGroup {
  readonly name: string;
  readonly capabilities: readonly string[];
}

/** The whole docs site document. */
export interface DocsSite {
  readonly version: 1;
  readonly groups: readonly DocsGroup[];
  readonly capabilities: readonly CapabilityPage[];
  readonly adrs: readonly AdrPage[];
}
