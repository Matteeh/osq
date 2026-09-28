## MODIFIED Requirements

### Requirement: Deterministic delta spec archival and appender removal
The archiver SHALL apply delta specifications into `openspec/specs/<capability>/spec.md` exclusively through deterministic delta merges using `applyOpenSpecDeltas`, SHALL NOT append legacy prose sections to feature documents, and the legacy prose appender function `applyDelta` SHALL NOT exist in the codebase. `applyOpenSpecDeltas` SHALL be defined in `src/core/spec/apply-deltas.ts`, which the default branch sync also uses, and `src/watcher/archiver.ts` SHALL import and re-export it.

#### Scenario: Archiving applies deltas via deterministic merge
- **WHEN** an approved change with delta specs completes all tasks
- **THEN** the archiver deterministically merges delta specs into living capability documents without prose appends

#### Scenario: Prose appender identifier is deleted
- **WHEN** the engine source code is inspected
- **THEN** the identifier `applyDelta` is completely absent from `src/`

#### Scenario: One merge for archive and sync
- **WHEN** `src/watcher/archiver.ts` and `src/core/vcs/sync-specs.ts` are inspected
- **THEN** both use the `applyOpenSpecDeltas` that `src/core/spec/apply-deltas.ts` defines, and neither defines its own
