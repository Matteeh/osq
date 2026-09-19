# watcher-and-harness Specification

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## Requirements

### Requirement: Exclusive locking and stale lock reaping
<!-- source: features/watcher-and-harness.md # Exclusive Locking & Stale Lock Reaping, tests/lock.test.ts, tests/runner-already-running.test.ts -->
The system SHALL manage atomic task locks and reap stale locks.

#### Scenario: Atomic lock acquisition
- **WHEN** runner initiates task `<n>`
- **THEN** system acquires `.run/running/<n>.pid` atomically and rejects execution if lock already exists

#### Scenario: Stale lock reaping
- **WHEN** active lock has terminated PID or age exceeds `staleLockSeconds`
- **THEN** watcher reaps the lock to `.run/dead/<n>.md` with reason `crashed` or `timeout`

### Requirement: Zero-trust verification gate and write-only checkbox projection
<!-- source: features/watcher-and-harness.md # Task Execution & Verification Gate, tests/runner.test.ts -->
The system SHALL execute independent task verification before marking tasks complete.

#### Scenario: Successful independent verification
- **WHEN** agent creates result file and `task.verify` exits with code 0
- **THEN** system writes `.run/done/<n>` and updates `- [x] <n>` in `tasks.md` as a write-only projection

#### Scenario: Failed verification
- **WHEN** `task.verify` exits non-zero or times out
- **THEN** system writes `.run/dead/<n>.md` with `reason: verify_red` and halts spec execution

### Requirement: Dead letter recording and failure handling
<!-- source: features/watcher-and-harness.md # Failure Reasons (Dead Letter Queue), tests/runner-done-dead-events.test.ts -->
The system SHALL record failure markers and dead events for all terminal failure reasons.

#### Scenario: Dead marker creation
- **WHEN** task fails due to `verify_red`, `spec_conflict`, `no_result`, `crashed`, `timeout`, or `already_running`
- **THEN** system writes `.run/dead/<n>.md` and appends `dead` event to `.run/events/<n>.jsonl`

### Requirement: Harness adapters and process execution
<!-- source: features/watcher-and-harness.md # Harness Adapters, tests/harness.test.ts, tests/opencode-spawn.test.ts, tests/agy-stream-events.test.ts -->
The system SHALL decouple agent execution via `HarnessAdapter` implementations.

#### Scenario: Adapter process spawning
- **WHEN** watcher executes a task
- **THEN** configured adapter spawns agent process, enforces execution timeouts, and routes event stream to normalized harness events

### Requirement: Authoritative lifecycle events and result synthesis
<!-- source: features/watcher-and-harness.md # Observability fixes, tests/runner-lifecycle-pid.test.ts, tests/runner-synthesized-result.test.ts -->
The system SHALL maintain authoritative lifecycle events and synthesize missing result files.

#### Scenario: Result file synthesis
- **WHEN** agent process exits successfully without authoring `.run/results/<n>.md`
- **THEN** runner extracts final text event and writes synthesized result file with `synthesized: true` frontmatter

### Requirement: Live terminal status row and curated logging
<!-- source: features/watcher-and-harness.md # Terminal UX & Observability, tests/logger-status.test.ts, tests/runner-terminal-status.test.ts, tests/runner-outcome-logging.test.ts -->
The system SHALL maintain an interactive status row and emit curated permanent log lines.

#### Scenario: Task outcome line logging
- **WHEN** task completes or dies
- **THEN** logger emits exactly one outcome line via `formatTaskOutcomeLine` at info level

### Requirement: Deterministic delta specification application
<!-- source: features/watcher-and-harness.md # Archiving & Delta Application, tests/archiver.test.ts -->
The system SHALL apply delta specifications into base capability specs upon change archival.

#### Scenario: Merging deltas into base specs
- **WHEN** all tasks in an approved spec are done
- **THEN** system applies `RENAMED`, `REMOVED`, `MODIFIED`, and `ADDED` blocks into `openspec/specs/<capability>/spec.md` deterministically and moves folder to archive

### Requirement: Reactive watcher loop and signal handling
<!-- source: features/watcher-and-harness.md # Commands, tests/watcher.test.ts, tests/watcher-loop-logging.test.ts -->
The system SHALL watch specifications reactively and respond cleanly to termination signals.

#### Scenario: SIGINT interruption handling
- **WHEN** SIGINT is received during task execution
- **THEN** watcher clears status line, restores cursor, awaits active task exit, and terminates immediately on second SIGINT

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

### Requirement: Emitted verify_ran event exit code and duration
<!-- source: src/harness/types.ts, src/watcher/verify.ts, src/watcher/runner.ts -->
The runner and verification gate SHALL emit `verify_ran` events carrying `exitCode` and `duration` across all task and archive verification executions through a single code path.

#### Scenario: Verified task event fields
- **WHEN** task verification succeeds
- **THEN** runner emits a `verify_ran` event containing `command`, `exitCode: 0`, and wall-clock `duration` in seconds

#### Scenario: Failed task event fields
- **WHEN** task verification exits with non-zero code or times out
- **THEN** runner emits a `verify_ran` event containing `command`, non-zero `exitCode`, and elapsed `duration` in seconds

#### Scenario: Single verification event emission path
- **WHEN** any verification gate executes
- **THEN** exactly one code path in the verification subsystem measures duration, captures process exit status, and records the `verify_ran` event

### Requirement: Done marker scope hash frontmatter
<!-- source: src/watcher/outcome.ts, src/watcher/regression.ts -->
The engine SHALL record YAML frontmatter in `.run/done/<n>` markers comprising the post-task content-addressed hash of the task scope, the active build stamp, and the verification exit code.

#### Scenario: Done marker frontmatter emission
- **WHEN** a task successfully verifies and finishes
- **THEN** `.run/done/<n>` is written with YAML frontmatter containing `scope_hash`, `build_stamp`, and `exit_code: 0`, followed by the ISO timestamp

#### Scenario: Scope hash stability across task completions
- **WHEN** scoped files are fingerprinted at task completion
- **THEN** `scope_hash` is computed deterministically from the sorted scoped file paths and their UTF-8 content SHA-256 digests

### Requirement: Pre-spawn scope comparison and regression detection
<!-- source: src/watcher/regression.ts, src/watcher/runner.ts -->
Before spawning task n+1, the runner SHALL verify all earlier completed tasks' recorded scope hashes against the current working tree, detecting regressions prior to process spawn.

#### Scenario: Pre-spawn scope hash comparison passes
- **WHEN** all files belonging to earlier done tasks scopes retain their recorded hashes in the current tree
- **THEN** runner proceeds to spawn task n+1

#### Scenario: Scope regression detected prior to task spawn
- **WHEN** any scoped file of an earlier completed task has been altered or deleted in the current tree
- **THEN** runner refuses to spawn task n+1, writes `.run/regressed/<earlierTask>.md` listing differing paths, appends a `regressed` event, and halts execution

### Requirement: Regressed marker, event, and status lifecycle
<!-- source: src/core/layout.ts, src/core/state.ts, src/core/status.ts, src/watcher/outcome.ts, src/harness/types.ts -->
The engine SHALL record regression failures under `.run/regressed/`, emit typed `regressed` events to event streams, and reflect `regressed` state across spec derivation and status overview inspection.

#### Scenario: Regressed marker content and differing paths
- **WHEN** a regression is detected
- **THEN** engine writes `.run/regressed/<n>.md` (or `.run/regressed/change.md`) containing the failure reason, exit code, command, output, or differing paths

#### Scenario: Regressed event emission
- **WHEN** a regressed marker is written
- **THEN** engine appends a `regressed` event to `.run/events/<target>.jsonl` carrying `exitCode` and `duration`

#### Scenario: Status command formats regressed task and change
- **WHEN** `osq status` inspects a change with regressed tasks or change-level regression
- **THEN** status output displays `[!] <task>. <title> [regressed]` and marks the spec overview as `[regressed]`

### Requirement: Archive-time verification re-run
<!-- source: src/watcher/archiver.ts, src/watcher/verify.ts -->
Before archiving a completed change, the archiver SHALL re-run every task's verification command followed by the proposal's change-level verification command against the final working tree under the runner timeout and TTY-free environment.

#### Scenario: Archive verification passes and seals change
- **WHEN** all task verification commands and the change-level verify command exit with code 0 against the final tree
- **THEN** archiver applies deltas and relocates the change folder to `openspec/changes/archive/`

#### Scenario: Task verification regression blocks archive
- **WHEN** any task verification command fails during archive preflight
- **THEN** archiver halts, writes `.run/regressed/<n>.md`, appends a `regressed` event to `.run/events/<n>.jsonl`, and leaves the change unarchived

#### Scenario: Change-level verification regression blocks archive
- **WHEN** the change-level verify command fails during archive preflight
- **THEN** archiver halts, writes `.run/regressed/change.md`, appends a `regressed` event to `.run/events/change.jsonl`, and leaves the change unarchived

### Requirement: Deterministic delta spec archival and appender removal
<!-- source: src/watcher/archiver.ts, tests/archiver.test.ts, tests/living-specs-delta-equivalence.test.ts -->
The archiver SHALL apply delta specifications into `openspec/specs/<capability>/spec.md` exclusively through deterministic delta merges using `applyOpenSpecDeltas`, SHALL NOT append legacy prose sections to feature documents, and the legacy prose appender function `applyDelta` SHALL NOT exist in the codebase.

#### Scenario: Archiving applies deltas via deterministic merge
- **WHEN** an approved change with delta specs completes all tasks
- **THEN** the archiver deterministically merges delta specs into living capability documents without prose appends

#### Scenario: Prose appender identifier is deleted
- **WHEN** the engine source code is inspected
- **THEN** the identifier `applyDelta` is completely absent from `src/`

### Requirement: Marker retention under run directory
<!-- source: src/watcher/runner.ts, tests/dead-marker-retention.test.ts -->
The task runner and watcher loop SHALL NOT delete any marker under `.run/` upon successful task completion or rerun. Prior diagnostic markers remain intact.

#### Scenario: Successful task run leaves prior dead markers untouched
- **WHEN** a task with an existing `.run/dead/<n>.<attempt>.md` marker completes successfully
- **THEN** runner writes `.run/done/<n>` without removing the historical dead marker

### Requirement: Manual task completion lifecycle event
<!-- source: src/harness/types.ts, src/core/done.ts, tests/done-manual.test.ts -->
The harness event stream SHALL support a typed `done_manual` event recording human task completion with justification.

#### Scenario: Typed done_manual event emission
- **WHEN** a task is marked done manually
- **THEN** system appends an event to `.run/events/<n>.jsonl` with `type: "done_manual"` and payload containing `task` and `reason`
