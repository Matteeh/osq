# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Deterministic delta spec archival and appender removal
<!-- source: src/watcher/archiver.ts, tests/archiver.test.ts, tests/living-specs-delta-equivalence.test.ts -->
The archiver SHALL apply delta specifications into `openspec/specs/<capability>/spec.md` exclusively through deterministic delta merges using `applyOpenSpecDeltas`, SHALL NOT append legacy prose sections to feature documents, and the legacy prose appender function `applyDelta` SHALL NOT exist in the codebase.

#### Scenario: Archiving applies deltas via deterministic merge
- **WHEN** an approved change with delta specs completes all tasks
- **THEN** the archiver deterministically merges delta specs into living capability documents without prose appends

#### Scenario: Prose appender identifier is deleted
- **WHEN** the engine source code is inspected
- **THEN** the identifier `applyDelta` is completely absent from `src/`