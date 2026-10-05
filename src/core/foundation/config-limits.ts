export interface OsqLimits {
  readonly maxScopeFiles: number;
  readonly maxFeatureWrites: number;
  readonly maxContractTables: number;
  readonly maxAcceptanceLines: number;
  /** Import levels the frozen-test reach warning follows. */
  readonly importGraphDepth: number;
  /** The most tests or files one import-graph warning lists. */
  readonly maxListedImporters: number;
  /** The most characters an accepted ADR's rule may have. */
  readonly maxRuleLength: number;
  /** The most system-wide rules the AGENTS.md block may hold. */
  readonly maxProjectRules: number;
  /** The most marker lines a dispatch halt card shows. */
  readonly cardOutputLines: number;
  /** The most output lines a `.run/` marker keeps without a failing-tests section. */
  readonly markerOutputLines: number;
  /** The most characters a marker keeps of any one output line. */
  readonly markerLineChars: number;
}
