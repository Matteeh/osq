# Watcher and Harness

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner, process execution, and agent harnesses.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher or harness execution
- **THEN** system maps `src/watcher/**`, `src/harness/**`, and `src/core/lock.ts` to `watcher-and-harness`

### Requirement: Capability rule prompt injection
<!-- source: src/harness/agy.ts, src/harness/opencode.ts, tests/harness-prompt-injection.test.ts -->
The harness runner SHALL extract rules from capability specifications written by the active change and inject them into the executor prompt.

#### Scenario: Prompt injection on change with capability writes
- **WHEN** an approved change writes capability deltas under `specs/<capability>/spec.md`
- **THEN** runner extracts capability requirements and injects them under a dedicated section within the prompt's `Rules:` block

#### Scenario: Fallback when no capability rules exist
- **WHEN** an approved change has no capability delta rules
- **THEN** runner provides standard operational rules without empty rule headers

### Requirement: Test modification gating
<!-- source: src/watcher/runner.ts, tests/runner-test-gating.test.ts -->
The runner SHALL detect modifications to existing test files following agent execution and gate completion on the task's `tests.modify` declaration.

#### Scenario: Test modification with tests.modify true
- **WHEN** agent modifies preexisting test files and task declared `tests.modify: true`
- **THEN** runner proceeds to independent zero-trust verification gate

#### Scenario: Test modification without tests.modify declaration
- **WHEN** agent modifies or deletes preexisting test files and task omitted `tests.modify: true`
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, emits a `dead` event, and halts without running verification

#### Scenario: Brand new test file creation
- **WHEN** agent creates a new test file without modifying preexisting test files
- **THEN** runner permits the addition without requiring `tests.modify: true`

### Requirement: Build identity metadata
<!-- source: src/watcher/build.ts, src/watcher/loop.ts, src/watcher/runner.ts -->
The watcher and runner SHALL identify the active osq build version and git commit or dist hash across lifecycle events and idle status.

#### Scenario: Task started lifecycle event metadata
- **WHEN** a task begins execution and emits a `started` lifecycle event
- **THEN** runner records the osq package version and git commit SHA or dist hash under event data

#### Scenario: Idle status line build prefix
- **WHEN** watcher formats the idle status line while waiting for approved specs
- **THEN** status output prefixes the line with `osq v<version> (<commit>)`

### Requirement: Stale build preflight detection
<!-- source: src/watcher/build.ts, src/watcher/loop.ts -->
The watcher SHALL verify that compiled output is not older than source files when started from a checkout.

#### Scenario: Stale build detected on checkout without allow-stale
- **WHEN** watcher starts from a checkout and newest file mtime under `src/` exceeds newest mtime under `dist/` without `--allow-stale`
- **THEN** watcher logs a single error line to stderr and exits non-zero

#### Scenario: Stale build bypassed with allow-stale
- **WHEN** watcher starts from a checkout with stale `dist/` and `--allow-stale` is supplied
- **THEN** watcher continues startup into the execution loop

### Requirement: Reactive dev mode execution
<!-- source: src/cli/watch.ts, src/watcher/dev.ts -->
The watcher in dev mode SHALL execute from source via tsx and restart the watch loop on source file changes.

#### Scenario: Dev mode execution through tsx
- **WHEN** watcher starts with `--dev`
- **THEN** execution runs through `tsx` directly from `src/`

#### Scenario: Source file modification during task execution
- **WHEN** a file under `src/` changes while a task is running in dev mode
- **THEN** watcher finishes the active task verification and outcome recording before restarting the loop

### Requirement: Runner lifecycle modularization
<!-- source: src/watcher/runner.ts, src/watcher/lock.ts, src/watcher/spawn.ts, src/watcher/heartbeat.ts, src/watcher/verify.ts, src/watcher/outcome.ts -->
The watcher runner SHALL partition lifecycle phases into discrete modules under 200 lines each (`lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, `outcome.ts`), with `runner.ts` orchestrating the sequence.

#### Scenario: Module line budget limit
- **WHEN** line counts are evaluated for `lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, `outcome.ts`, and `runner.ts`
- **THEN** each file contains fewer than 200 lines of code

#### Scenario: Lifecycle sequence orchestration
- **WHEN** `runTask` executes
- **THEN** runner coordinates lock acquisition, heartbeat observation, agent process execution, test gating, verification, and outcome recording across dedicated lifecycle modules

### Requirement: Architectural import graph boundaries
<!-- source: src/core/**, src/harness/**, src/watcher/**, tests/import-graph.test.ts -->
The codebase SHALL enforce strict directional import boundaries across packages, preventing backward or cross-tier dependency leaks.

#### Scenario: Core layer isolation
- **WHEN** import dependencies of `src/core/**` are analyzed
- **THEN** no module in `src/core` imports from any directory outside `src/core`

#### Scenario: Harness layer boundaries
- **WHEN** import dependencies of `src/harness/**` are analyzed
- **THEN** no module in `src/harness` imports from `src/watcher` or `src/cli`

#### Scenario: Watcher layer boundaries
- **WHEN** import dependencies of `src/watcher/**` are analyzed
- **THEN** no module in `src/watcher` imports from `src/cli`

### Requirement: Typed event hygiene and single emission path
<!-- source: src/harness/types.ts, src/core/summary.ts, src/harness/opencode.ts, src/harness/agy.ts, src/watcher/spawn.ts -->
The harness and watcher SHALL record lifecycle and tool events using a typed discriminated union, with tool summaries relativized to the project root at write time, single code path emission per event type, and build metadata on task initiation.

#### Scenario: Task started event metadata
- **WHEN** a task execution starts
- **THEN** the single `started` event emitted by the runner includes `harness`, `model`, and `osqVersion` under event data

#### Scenario: Write-time tool summary relativization
- **WHEN** an agent executes a tool call targeting workspace files
- **THEN** harness relativizes absolute project paths in the tool summary relative to the project root before writing to `events.jsonl`

### Requirement: Golden event stream validation
<!-- source: tests/golden-events.test.ts, tests/fixtures/events/** -->
The test suite SHALL validate end-to-end task execution event streams against checked-in golden fixtures for both verified and dead task outcomes.

#### Scenario: Verified task golden events match
- **WHEN** runner executes a successful mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/verified.jsonl`

#### Scenario: Dead task golden events match
- **WHEN** runner executes a failing mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/dead.jsonl`

### Requirement: Consolidated marker writing and pure state derivation
<!-- source: src/watcher/outcome.ts, src/core/lock.ts, src/core/state.ts, tests/runner-done-dead-events.test.ts -->
The engine SHALL centralize marker file emission in dedicated watcher outcome helpers, isolate lock reaping to detection, and evaluate change status purely against in-memory filesystem snapshots.

#### Scenario: Marker and event invariant parity
- **WHEN** a task terminates under any `RunTaskFailureReason` or reaches successful completion
- **THEN** matching marker content and lifecycle events are written through centralized outcome helpers

#### Scenario: Pure spec state derivation
- **WHEN** spec state is computed
- **THEN** `deriveSpecState` evaluates an in-memory change folder snapshot without performing direct asynchronous disk I/O

### Requirement: Source module line budget enforcement
<!-- source: tests/line-budget.test.ts -->
The test suite SHALL enforce a 250-line maximum on all source files under `src/`, permitting exceptions only for explicitly allow-listed legacy modules.

#### Scenario: Source file size within budget
- **WHEN** files under `src/` are inspected
- **THEN** all files except `report.ts`, `show.ts`, `opencode.ts`, and `agy.ts` contain 250 or fewer lines of code

### Requirement: Backward-compatible state derivation and watcher layout cut-over
<!-- source: src/core/state.ts, src/watcher/archiver.ts -->
The state derivation subsystem SHALL support overloaded invocation for both in-memory snapshots and direct project paths, while the watcher archiver resolves destination paths through canonical layout helpers.

#### Scenario: Asynchronous disk-backed state derivation
- **WHEN** callers invoke `deriveSpecState(projectRoot, folderPath)`
- **THEN** function reads change folder snapshot from disk asynchronously and returns the derived `SpecState`

#### Scenario: Archiver uses canonical layout
- **WHEN** watcher completes and archives a change
- **THEN** archive destination path is determined using `getArchiveDir` from `src/core/layout.ts`

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

## Delta from Raw measures and a run manifest

This change adds run manifest generation at approval time and raw measures event emission at task start and end to `watcher-and-harness` and `metrics-and-reporting`.
