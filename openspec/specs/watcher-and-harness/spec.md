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
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts, src/core/manifest.ts, tests/retry*.test.ts, tests/reject.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, agent harnesses, adapter registration, execution manifest
construction, and append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/lock.ts`, `src/core/manifest.ts`, `tests/retry*.test.ts`, and `tests/reject.test.ts` to watcher-and-harness

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
<!-- source: src/harness/types.ts, src/core/summary.ts, src/core/retry.ts, src/core/reject.ts, src/harness/opencode.ts, src/harness/agy.ts, src/watcher/spawn.ts -->
The harness and watcher SHALL record lifecycle, retry, rejection, and tool
events using a typed discriminated union, with tool summaries relativized to
the project root at write time and a single code path for each event type.
Every new started event SHALL include build identity and execution attempt.

#### Scenario: Task started event metadata
- **WHEN** a task execution starts
- **THEN** the single `started` event emitted by the runner includes `harness`, `model`, `osqVersion`, and `attempt` under event data

#### Scenario: Retry and rejection event typing
- **WHEN** retry or rejection succeeds
- **THEN** its event is appended through the shared event writer with the payload defined for that discriminant

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
<!-- source: src/core/approve.ts, src/core/manifest.ts, tests/manifest.test.ts -->
The approve command SHALL write `.run/manifest.json` containing content-addressed
hashes of `AGENTS.md`, `PLANNER.md`, the config file, and each capability spec
the change reads or writes; the osq version, harness, model, effort setting, and
timestamps for creation and approval; and `planningSessions`, the count of valid
`plan_started` records already present in `.run/plan.jsonl`. A missing or empty
planning log SHALL produce zero. Because the log lives below `.run/`, it SHALL
NOT affect approval hashing.

#### Scenario: Manifest written on approval
- **WHEN** `osq approve` seals a change
- **THEN** `.run/manifest.json` contains content hashes, execution identity, creation and approval timestamps, and the recorded planning-session count

#### Scenario: Approval after multiple planning sessions
- **WHEN** a change with new and resumed planning sessions is approved
- **THEN** the manifest counts every valid `plan_started` record while the approved content hash remains independent of the planning log

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
<!-- source: src/watcher/runner.ts, src/core/retry.ts, tests/dead-marker-retention.test.ts, tests/retry*.test.ts -->
The task runner, watcher loop, and approval command SHALL NOT delete, rename, or
otherwise retire active or historical failure markers under `.run/`. Only an
explicit successful retry may rename active dead, regressed, and associated
done markers into attempt-suffixed history. Successful reruns SHALL write new
active done markers without removing historical diagnostics.

#### Scenario: Successful task run leaves prior dead markers untouched
- **WHEN** a retried task with attempt-suffixed failure markers completes successfully
- **THEN** runner writes `.run/done/<n>` without removing or rewriting historical markers

#### Scenario: Approval leaves failure active
- **WHEN** a failed change is reapproved after authored edits
- **THEN** watcher still observes the active failure until explicit retry

### Requirement: Manual task completion lifecycle event
<!-- source: src/harness/types.ts, src/core/done.ts, tests/done-manual.test.ts -->
The harness event stream SHALL support a typed `done_manual` event recording human task completion with justification.

#### Scenario: Typed done_manual event emission
- **WHEN** a task is marked done manually
- **THEN** system appends an event to `.run/events/<n>.jsonl` with `type: "done_manual"` and payload containing `task` and `reason`

### Requirement: Interactive harness adapter spawning
<!-- source: src/harness/types.ts, src/harness/opencode.ts, src/harness/agy.ts, src/harness/mock.ts, tests/harness-interactive.test.ts -->
Harness adapters SHALL implement `spawnInteractive` inheriting terminal stdio and returning the process exit code.

#### Scenario: Opencode interactive session spawning
- **WHEN** `OpencodeAdapter.spawnInteractive` executes
- **THEN** adapter executes binary with inherited stdio, passing prompt, working directory, and optional model and agent flags

#### Scenario: Agy interactive session spawning
- **WHEN** `AgyAdapter.spawnInteractive` executes
- **THEN** adapter executes binary with inherited stdio, passing prompt via `-i`, and optional model and agent flags

### Requirement: Codex task execution
<!-- source: src/harness/codex*.ts, src/harness/index.ts, src/watcher/loop.ts, tests/codex/** -->
The Codex adapter SHALL implement the existing HarnessAdapter port without new methods and SHALL run each task in a fresh noninteractive process in the project root. It SHALL use literal argv, exec JSONL output, workspace-write sandboxing, approval policy never, disabled web search and workspace shell network access, and optional model/effort overrides. It SHALL retain native authentication/config loading without modifying it or bypassing enforced policies.

#### Scenario: Executor prompt
- **WHEN** an approved task is spawned
- **THEN** Codex receives task/proposal/delta/living capability paths, prior-result guidance, scope, entry files, verification command, result destination, capability rules, and the one-attempt execution procedure

#### Scenario: Process controls
- **WHEN** the adapter starts a task
- **THEN** it reuses shared process execution with configured task timeout and kill grace, preserves PID/signal/elapsed diagnostics, uses a literal prompt argument, and does not use shell interpolation, full-auto, permission bypass flags, or session resume

#### Scenario: Watcher preflight
- **WHEN** the watcher starts with Codex
- **THEN** it invokes the adapter's existing preflight port to probe the resolved binary with --version under the configured preflight deadline, and a failed probe prevents task-agent spawn

### Requirement: Codex stream observations
<!-- source: src/harness/codex*.ts, src/harness/stream.ts, tests/codex/** -->
The adapter SHALL use shared ordered JSONL buffering to translate completed Codex observations into existing osq events, without emitting watcher lifecycle or verification events.

#### Scenario: Completed item translation
- **WHEN** item.completed supplies a non-empty assistant message, command/MCP observation, or successful file change
- **THEN** the adapter emits text, tool, or file_changed respectively, uses project-relative paths, excludes reasoning text from results, and does not count file changes again as edit/write tool events

#### Scenario: Usage translation
- **WHEN** turn.completed contains usage
- **THEN** input_tokens becomes promptTokens, output_tokens becomes candidateTokens, cached_input_tokens becomes cachedTokens, and reported reasoning_output_tokens becomes reasoningTokens; totalTokens is input plus output, and absent optional counters and cost are omitted

#### Scenario: Chunked and unfamiliar output
- **WHEN** stdout contains fragmented records, an unterminated final record, malformed JSON, unknown events, or item lifecycle updates
- **THEN** valid observations remain ordered, the parser flushes before spawn returns, malformed/unknown records do not abort parsing, and only completed stages emit completed observations

### Requirement: Codex failure and result handling
<!-- source: src/harness/codex*.ts, src/watcher/spawn.ts, src/watcher/verify.ts, tests/codex/** -->
The adapter SHALL return terminal Codex failures to the existing watcher lifecycle. The watcher SHALL own results, markers, checkboxes, and independent verification.

#### Scenario: Terminal turn failure
- **WHEN** Codex reports turn.failed even if its process exits zero
- **THEN** spawn returns a failed outcome carrying diagnostic text and the watcher records crashed

#### Scenario: Process failure and recovery
- **WHEN** Codex exits unsuccessfully or times out
- **THEN** the watcher records crashed or timeout through existing outcomes; a recoverable error event followed by a successful turn does not alone cause terminal failure

#### Scenario: Result fallback
- **WHEN** Codex exits successfully without a result file
- **THEN** the watcher synthesizes a result from the last completed non-empty assistant text, or records no_result when no such text exists

#### Scenario: Independent verification
- **WHEN** a successful Codex process supplies a result or final text
- **THEN** the watcher writes done only after its own verification passes and records verify_red when verification fails

### Requirement: Codex execution attribution
<!-- source: src/core/manifest.ts, src/core/config*.ts, src/watcher/spawn.ts, tests/codex/** -->
Execution manifests and started events SHALL record the selected Codex model without another harness's fallback. Native model selection SHALL be represented as default rather than a guessed model. The manifest SHALL record configured Codex effort or null while preserving explicit planner.model-or-null semantics.

#### Scenario: Explicit settings
- **WHEN** Codex execution has a selected model and effort
- **THEN** process arguments, started metadata, and execution manifest agree on the model and the manifest records that effort

#### Scenario: Native model
- **WHEN** no Codex model override applies
- **THEN** the CLI model flag is omitted and execution metadata records default without an agy or OpenCode model

### Requirement: Codex interactive sessions
<!-- source: src/harness/codex*.ts, src/cli/plan.ts, tests/codex/** -->
The adapter SHALL implement the existing spawnInteractive port using Codex's interactive CLI with inherited stdio, project cwd, the supplied opening prompt, optional selected model, workspace-write sandboxing, and on-request approvals. It SHALL use native planner effort defaults and reject unsupported agent arguments.

#### Scenario: Interactive launch
- **WHEN** osq plan invokes the registered Codex adapter
- **THEN** the interactive process receives the existing ordered prompt without exec/JSON flags or executor effort overrides

#### Scenario: Interactive termination
- **WHEN** the interactive process exits nonzero, is terminated by a signal, or cannot spawn
- **THEN** the adapter returns a nonzero outcome that the planning command propagates

### Requirement: Exhaustive adapter registration and generic preflight
<!-- source: src/harness/index.ts, src/watcher/loop.ts, tests/harness-catalog.test.ts, tests/harness-generic-workflows.test.ts -->
The harness subsystem SHALL provide one adapter factory for every canonical catalog entry and no unlisted factory. Watcher startup SHALL invoke the selected adapter's optional preflight port before task execution without testing the adapter's name, and SHALL continue normally when the port is absent.

#### Scenario: Adapter with preflight
- **WHEN** watcher startup receives any registered adapter implementing preflight
- **THEN** it invokes preflight before the first execution cycle and propagates failure without spawning a task

#### Scenario: Adapter without preflight
- **WHEN** watcher startup receives a registered adapter without preflight
- **THEN** it enters the execution cycle without a harness-specific fallback

### Requirement: Shared selected-harness attribution
<!-- source: src/core/harness-catalog.ts, src/core/manifest.ts, src/cli/plan.ts, src/watcher/spawn.ts, tests/harness-generic-workflows.test.ts -->
Approval manifests, task-start events, planning briefs, and interactive planning arguments SHALL consume shared selected-harness resolution. Executor identity SHALL contain the selected harness, its effective model or `default`, and applicable effort or null. Planner selection SHALL remain independent when its harness differs from the executor.

#### Scenario: Consistent executor identity
- **WHEN** a registered harness executes an approved task
- **THEN** its process selection, approval manifest, and started event agree on harness and model attribution, and effort is recorded only when applicable

#### Scenario: Mixed executor and planner harnesses
- **WHEN** executor and planner select different registered harnesses
- **THEN** planning brief and invocation values come only from the planner selection while manifest execution fields and started events come only from the executor selection

#### Scenario: Native model selection
- **WHEN** the selected harness leaves model choice to its native default
- **THEN** metadata records `default`, the native invocation receives no invented model override, and no other harness's configured model is used

### Requirement: Observed-only interactive usage port
<!-- source: src/harness/types.ts, src/harness/agy.ts, src/harness/opencode*.ts, src/harness/codex*.ts, tests/plan-telemetry.test.ts -->
`HarnessAdapter` SHALL offer this optional post-session usage port:

```ts
readInteractiveUsage?(options: {
  cwd: string;
  startedAt: string;
  endedAt: string;
}): Promise<{
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  reasoningTokens: number | null;
  cost: number | null;
}>;
```

Missing readers, missing fields, malformed artifacts, read failures, and
ambiguous session matches SHALL yield null fields and SHALL NOT change the
planner process exit result.

OpenCode SHALL read the one local session database row created for the working
directory during the observed interval, using its stored input, output,
reasoning, cache-read, cache-write, and cost columns. Codex SHALL read the one
new rollout JSONL session whose `session_meta` matches the working directory and
use the last cumulative `token_usage_record.payload.thread_token_usage` values.
Codex cost SHALL remain null because its local rollout record does not carry
cost. AGY SHALL participate in the same generic lifecycle recording and return
all-null usage because no confirmed local AGY usage artifact is in scope.
Neither reader SHALL inspect or retain transcript content.

#### Scenario: Exact OpenCode usage
- **WHEN** exactly one matching OpenCode session row exposes usage and cost
- **THEN** the reader returns those stored values, with cached tokens equal to the harness's reported cache-read plus cache-write counters

#### Scenario: Exact Codex usage
- **WHEN** exactly one matching Codex rollout exposes cumulative thread usage
- **THEN** the reader returns its input, output, cached-input, and reasoning-output counters and a null cost

#### Scenario: AGY usage unavailable
- **WHEN** AGY completes an interactive planning session
- **THEN** its reader returns null for input, output, cached, reasoning, and cost while generic lifecycle timing remains recorded

#### Scenario: Usage unavailable or ambiguous
- **WHEN** no unique matching local artifact supplies a usage field
- **THEN** that field is null and osq performs no estimation or transcript parsing

### Requirement: Explicit archive timestamp
<!-- source: src/watcher/archiver.ts, src/harness/types.ts, tests/archiver.test.ts -->
After successful archive-time verification and relocation, the watcher SHALL
append one typed `archived` event to `.run/events/change.jsonl` in the archived
folder. The event timestamp is the authoritative archive time for cycle metrics
and SHALL NOT be emitted to any task event file.

#### Scenario: Successful archive
- **WHEN** a completed change is successfully moved into the archive
- **THEN** its change-level event stream contains one `archived` event timestamped after the move

#### Scenario: Blocked archive
- **WHEN** archive verification or relocation fails
- **THEN** no `archived` event is recorded

### Requirement: Preserving retry transition
<!-- source: src/core/retry.ts, src/core/layout.ts, src/watcher/**, tests/retry*.test.ts -->
Retry SHALL be the sole transition that retires an active dead or regressed
marker. It SHALL rename rather than delete the active marker, using the next
target-wide ordinal across retained dead and regressed failures. A task-level
regression SHALL also preserve its active done marker under an inactive
attempt-suffixed name so the retried task derives as pending. A change-level
retry SHALL accept the literal target `change` and make archive verification
eligible to run again.

#### Scenario: Dead marker retained
- **WHEN** a task's first active dead marker is retried
- **THEN** `dead/<n>.md` becomes `dead/<n>.1.md` and the task becomes pending without deleting diagnostics

#### Scenario: Regressed completion retained
- **WHEN** a regressed numeric task has an active done marker
- **THEN** retry retains both failure and completion markers under inactive attempt names before the task runs again

#### Scenario: Change regression retained
- **WHEN** the change target is retried
- **THEN** `regressed/change.md` becomes its next attempt-suffixed historical marker

### Requirement: Retry attempt lifecycle events
<!-- source: src/harness/types.ts, src/core/retry.ts, src/watcher/spawn.ts, tests/retry*.test.ts, tests/golden-events.test.ts -->
The lifecycle event union SHALL include a typed `retry` event carrying target,
reason, and next execution attempt. Every newly emitted `started` event SHALL
carry its execution attempt. Initial execution is attempt 1, and the first
start after retry SHALL match the attempt in the preceding retry event. Legacy
started events without attempt SHALL remain readable.

#### Scenario: Initial attempt
- **WHEN** the runner spawns a task without retained failure history
- **THEN** its started event contains `attempt: 1`

#### Scenario: Retried attempt
- **WHEN** retry records the next attempt and the watcher later spawns the task
- **THEN** the target event stream contains retry followed by started with the same attempt

### Requirement: Retried executor context
<!-- source: src/harness/types.ts, src/harness/agy.ts, src/harness/opencode.ts, src/harness/codex-prompt.ts, src/watcher/spawn.ts, tests/harness-prompt-injection.test.ts -->
The runner SHALL reconstruct retry context from append-only state and pass the
attempt and failure reason through shared spawn options. Every textual harness
prompt SHALL identify the prior failure reason and the existing prior result
file in one prior-context section. Retry SHALL NOT remove the result before
spawn.

#### Scenario: Fresh process receives retry context
- **WHEN** the watcher restarts after retry and then spawns the target
- **THEN** the executor prompt identifies the retry attempt, retained failure reason, and prior result path

### Requirement: Rejection lifecycle record
<!-- source: src/core/reject.ts, src/harness/types.ts, tests/reject.test.ts -->
A successful rejection SHALL write `.run/rejected.md` in the moved folder and
append one typed `rejected` event to `.run/events/change.jsonl`. Both artifacts
SHALL record the same non-empty reason and ISO timestamp while all pre-existing
events and run artifacts remain intact.

#### Scenario: Rejection is recorded after relocation
- **WHEN** an eligible change moves to the rejected directory
- **THEN** its destination contains a matching rejection marker and change-level event after all previous event bytes
