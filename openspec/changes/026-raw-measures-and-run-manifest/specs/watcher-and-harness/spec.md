## ADDED Requirements

### Requirement: Run manifest at approval
<!-- source: src/core/approve.ts, src/core/manifest.ts -->
The approve command SHALL write `.run/manifest.json` containing content-addressed hashes of `AGENTS.md`, `PLANNER.md`, the config file, and each capability spec the change reads or writes, plus the osq version, harness, model, effort setting, and timestamps for creation and approval.

#### Scenario: Manifest written on approval
- **WHEN** `osq approve` seals a change
- **THEN** `.run/manifest.json` is written containing SHA-256 hashes of `AGENTS.md`, `PLANNER.md`, the resolved config file, and each capability spec referenced by `features.reads` and `features.writes`, plus `osqVersion`, `harness`, `model`, `effort`, `createdAt`, and `approvedAt`

#### Scenario: Manifest hashes are content-addressed
- **WHEN** manifest input files are hashed
- **THEN** each hash is `sha256:<hex>`, computed from the UTF-8 content, or `null` when the file does not exist

### Requirement: Raw measures events on task lifecycle
<!-- source: src/watcher/measures.ts, src/harness/types.ts -->
The runner SHALL emit a `measures` event at task start and task end carrying raw file and line counts for scope, changed files, repo totals, import fan-in, content word counts, and delta requirement and scenario counts.

#### Scenario: Measures event at task start
- **WHEN** a task begins execution after the `started` event
- **THEN** runner emits a `measures` event with `phase: "start"`, `scopeFiles`, `scopeLines`, `repoFiles`, `repoLines`, `importFanIn`, `proposalWords`, `taskWords`, `deltaRequirements`, and `deltaScenarios`

#### Scenario: Measures event at task end
- **WHEN** a task reaches done or dead outcome
- **THEN** runner emits a `measures` event with `phase: "end"`, all start-phase fields, plus `changedFiles`, `changedLines`, and `scopeHashes` (before/after SHA-256 per scoped file, no git)

#### Scenario: Single emission path
- **WHEN** measures events are emitted
- **THEN** exactly one code path (`emitMeasures`) produces both start and end events
