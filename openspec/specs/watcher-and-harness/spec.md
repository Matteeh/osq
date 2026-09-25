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
<!-- source: src/watcher/runner.ts, src/watcher/change-verify.ts, src/watcher/verify.ts, tests/runner-test-gating.test.ts -->
The system SHALL execute independent task verification before marking tasks
complete. When `gates.changeVerifyAfterTask` is enabled, a successful task
verify SHALL be followed by the proposal's change-level verify under
`verifyTimeoutSeconds` before completion. A task SHALL reach done only after
every enabled gate passes.

This incremental change gate intentionally requires each completed task to
leave the full change verifier green. Changes that would be red between coupled
tasks SHALL be represented as one coherent task.

#### Scenario: Successful independent verification
- **WHEN** agent creates a result file and every enabled task-boundary verification exits with code 0
- **THEN** system writes `.run/done/<n>` and updates `- [x] <n>` in `tasks.md` as a write-only projection

#### Scenario: Failed verification
- **WHEN** `task.verify` exits non-zero or times out
- **THEN** system writes `.run/dead/<n>.md` with `reason: verify_red`, does not run the incremental proposal verify, and halts spec execution

#### Scenario: Failed incremental change verification
- **WHEN** task verification passes but the enabled proposal verify exits non-zero or times out
- **THEN** system writes `.run/dead/<n>.md` with `reason: change_verify_red` before any done marker or checkbox update and halts spec execution

#### Scenario: Incremental change verification disabled
- **WHEN** `gates.changeVerifyAfterTask` is false and task verification passes
- **THEN** runner proceeds to completion without running the proposal verify at that task boundary

### Requirement: Dead letter recording and failure handling
<!-- source: src/watcher/runner.ts, src/watcher/outcome.ts, src/watcher/change-verify.ts, src/watcher/task-verify.ts, tests/runner-test-gating.test.ts, tests/pre-spawn-verify.test.ts -->
The system SHALL record failure markers and dead events for all terminal failure reasons.

#### Scenario: Dead marker creation
- **WHEN** task fails due to `verify_red`, `change_verify_red`, `verify_precondition`, `spec_conflict`, `no_result`, `crashed`, `timeout`, or `already_running`
- **THEN** system writes `.run/dead/<n>.md` and appends `dead` event to `.run/events/<n>.jsonl`

#### Scenario: Change verification dead marker evidence
- **WHEN** incremental change-level verification fails or times out
- **THEN** the task dead marker records `change_verify_red`, command, numeric exit code, captured output, and timeout state when applicable

#### Scenario: Pre-spawn precondition dead marker evidence
- **WHEN** a pre-spawn verify mismatches under `gates.preSpawnVerify: fail`
- **THEN** the task dead marker records `verify_precondition`, command, expected start state, numeric exit code, and captured output

### Requirement: Harness adapters and process execution
<!-- source: features/watcher-and-harness.md # Harness Adapters, tests/harness.test.ts, tests/harness-process.test.ts, tests/opencode-spawn.test.ts, tests/agy-stream-events.test.ts -->
The system SHALL decouple agent execution via `HarnessAdapter` implementations.

#### Scenario: Adapter process spawning
- **WHEN** watcher executes a task
- **THEN** configured adapter spawns agent process, enforces execution timeouts, and routes event stream to normalized harness events

#### Scenario: Kill-grace timeout coverage
- **WHEN** the process timeout test runs a real child that handles `SIGTERM` without terminating
- **THEN** the test asserts that execution timed out and terminated with `SIGKILL`, without asserting wall-clock time

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
<!-- source: src/watcher/**, src/harness/**, src/core/run/**, src/core/lifecycle/**, tests/retry*.test.ts, tests/reject.test.ts, tests/done-manual.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, deterministic task-scope resolution and hashing, shared
verification execution, agent harnesses, adapter registration, execution
manifest construction, and append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, scope, verification, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/run/**`, `src/core/lifecycle/**`, `tests/retry*.test.ts`, `tests/reject.test.ts`, and `tests/done-manual.test.ts` to watcher-and-harness

### Requirement: Capability rule prompt injection
<!-- source: src/harness/prompt.ts, src/harness/types.ts, tests/harness-prompt-injection.test.ts -->
The harness runner SHALL extract rules from capability specifications written by the active change and inject them into the executor prompt.

#### Scenario: Prompt injection on change with capability writes
- **WHEN** an approved change writes capability deltas under `specs/<capability>/spec.md`
- **THEN** runner extracts capability requirements and injects them under a dedicated section within the prompt's `Rules:` block

#### Scenario: Fallback when no capability rules exist
- **WHEN** an approved change has no capability delta rules
- **THEN** runner provides standard operational rules without empty rule headers

### Requirement: Test modification gating
<!-- source: src/watcher/runner.ts, src/watcher/verify.ts, src/core/scope.ts, tests/runner-test-gating.test.ts -->
The runner SHALL snapshot every preexisting file under `tests/**` before agent
execution and resolve the task's scope against that pre-spawn tree. A changed
or deleted preexisting test file SHALL be authorized only when the task
declares `tests.modify: true` and that resolved scope contains the file.

Every unauthorized diagnostic SHALL be sorted by project-relative POSIX path
and name the file's changed or deleted state plus the literal file scope entry
that would authorize it.

#### Scenario: Test modification with tests.modify true
- **WHEN** agent changes or deletes a preexisting test file, `tests.modify: true`, and pre-spawn scope resolution contains that file
- **THEN** runner permits that file and proceeds to independent zero-trust verification

#### Scenario: Test modification outside declared scope
- **WHEN** agent changes or deletes a preexisting test file that pre-spawn scope resolution does not contain
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, names the required literal scope entry, emits a `dead` event, and halts without running verification

#### Scenario: Test modification without tests.modify declaration
- **WHEN** agent modifies or deletes a preexisting test file and task omitted `tests.modify: true`
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, emits a `dead` event, and halts without running verification

#### Scenario: Brand new test file creation
- **WHEN** agent creates a new test file that was absent from the pre-spawn snapshot
- **THEN** runner permits the addition without requiring `tests.modify: true`

### Requirement: Build identity metadata
<!-- source: src/watcher/build.ts, src/watcher/build-project.ts, src/watcher/loop.ts, src/watcher/spawn.ts, src/watcher/regression.ts, tests/watcher-build-identity.test.ts -->
The watcher and runner SHALL identify the running osq build across lifecycle
events, idle status, and done markers from osq's own package root: `version`
from its `package.json`, and `commit` from its short git HEAD only when that
root is the top of a git work tree, otherwise the hash of its `dist/`, otherwise
`unknown`. The project's commit SHALL be the project root's short HEAD commit,
or null outside git.

#### Scenario: Task started lifecycle event metadata
- **WHEN** a task begins execution and emits a `started` lifecycle event
- **THEN** runner records osq's package version as `version` and `osqVersion`, osq's commit or dist hash as `commit`, and the project's HEAD commit or null as `projectCommit` under event data

#### Scenario: Installed package inside the project's work tree
- **WHEN** osq's package root sits inside the project's git work tree but not at its top, as an installed package does
- **THEN** osq's commit is the hash of osq's `dist/` or `unknown`, never the project's HEAD

#### Scenario: Running from a checkout
- **WHEN** osq's package root is the top of its own git work tree
- **THEN** osq's commit is that checkout's short HEAD commit

#### Scenario: Project without git
- **WHEN** the project root is not in a git repository
- **THEN** the `started` event records `projectCommit: null`

#### Scenario: Idle status line build prefix
- **WHEN** watcher formats the idle status line while waiting for approved specs
- **THEN** status output prefixes the line with `osq v<version> (<commit>)` naming osq's own version and commit

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
Every new started event SHALL include osq's build identity, the project's
commit, and execution attempt.

#### Scenario: Task started event metadata
- **WHEN** a task execution starts
- **THEN** the single `started` event emitted by the runner includes `harness`, `model`, `osqVersion`, `projectCommit`, and `attempt` under event data

#### Scenario: Retry and rejection event typing
- **WHEN** retry or rejection succeeds
- **THEN** its event is appended through the shared event writer with the payload defined for that discriminant

#### Scenario: Write-time tool summary relativization
- **WHEN** an agent executes a tool call targeting workspace files
- **THEN** harness relativizes absolute project paths in the tool summary relative to the project root before writing to `events.jsonl`

### Requirement: Golden event stream validation
<!-- source: tests/golden-events.test.ts, tests/fixtures/events/** -->
The test suite SHALL validate end-to-end task execution event streams against
checked-in golden fixtures for both verified and dead task outcomes. The
comparison SHALL mask `measures` repository counts (`repoLines` and
`repoFiles`), so the fixtures do not depend on the scaffolded project's size.

#### Scenario: Verified task golden events match
- **WHEN** runner executes a successful mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/verified.jsonl`

#### Scenario: Dead task golden events match
- **WHEN** runner executes a failing mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/dead.jsonl`

#### Scenario: Scaffolded project size changes
- **WHEN** the managed planner block or a template gains or loses lines
- **THEN** both golden fixtures still match without regeneration

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
<!-- source: src/core/spec/approve.ts, src/core/run/manifest.ts, src/core/report/planning.ts, tests/manifest.test.ts, tests/manifest-creation.test.ts, tests/planning-observed-approve.test.ts, tests/approve-confirm.test.ts -->
The approve command SHALL write `.run/manifest.json` containing
content-addressed instruction, config, and capability hashes; execution
identity; `createdAt`; `approvedAt`; `planningSessions`, the number of valid
owned and observed `plan_started` records; nullable `planner` attribution; and
`approvalFlags` with the distinct sorted flag `ids` of this approval and a
`mode` of `confirmed` when they were confirmed at a prompt, else `shown`.
`osq plan` SHALL write the same manifest without `approvedAt` and
`approvalFlags`.

`createdAt` SHALL be an existing manifest's `createdAt`, kept together with its
`createdAtSource` when present. Without one, it SHALL be the change folder's
birth time, recorded with `createdAtSource: "created"`, and otherwise the
current time, marked `created` only when `osq plan` writes it.

`planner` SHALL use the model from the most recent observed session that reports
one, then the most recent owned `--session` record that reports one, else null.
Configuration alone SHALL never populate it. Planning logs remain below
`.run/` and SHALL NOT affect the approved content hash.

#### Scenario: Manifest written on approval
- **WHEN** `osq approve` seals a change
- **THEN** `.run/manifest.json` contains content hashes, execution identity, `createdAt`, `approvedAt`, planning-session count, observed planner attribution, and approval flags

#### Scenario: Manifest written at plan time
- **WHEN** `osq plan` creates a change
- **THEN** its manifest carries `createdAt` with `createdAtSource: "created"` and no `approvedAt`

#### Scenario: Approval keeps the creation time
- **WHEN** a planned change is approved, amended, and approved again
- **THEN** each manifest keeps the plan-time `createdAt` and `createdAtSource`, and `approvedAt` is the latest approval

#### Scenario: Approval without a prior manifest
- **WHEN** a change created by `osq new` without a manifest is approved on a filesystem that reports folder birth time
- **THEN** `createdAt` is the folder's birth time with `createdAtSource: "created"`

#### Scenario: Approval after multiple planning sessions
- **WHEN** a change with valid owned and observed starts is approved
- **THEN** the manifest counts every valid start while the approved content hash remains independent of the planning log

#### Scenario: Manifest hashes are content-addressed
- **WHEN** manifest input files are hashed
- **THEN** each hash is `sha256:<hex>` from UTF-8 content or null when the file does not exist

#### Scenario: Observed and owned sessions precede approval
- **WHEN** valid observed and owned lifecycle pairs exist
- **THEN** the manifest counts both and attributes planner to the most recent reported observed model

#### Scenario: No session reports a model
- **WHEN** neither observed nor owned planning history supplies a model
- **THEN** the manifest records `planner: null` regardless of configured planner values

#### Scenario: Approval without flags
- **WHEN** a change that trips no flag is approved
- **THEN** the manifest records `approvalFlags` with empty `ids` and mode `shown`

### Requirement: Raw measures events on task lifecycle
<!-- source: src/core/scope.ts, src/watcher/measures.ts, src/harness/types.ts -->
The runner SHALL emit a `measures` event at task start and task end carrying
resolver version 2, raw file and line counts for resolved scope files, changed
files, repository totals, import fan-in, content word counts, and delta
requirement and scenario counts.

#### Scenario: Measures event at task start
- **WHEN** runner begins a task whose scope contains exact paths and globs
- **THEN** it emits `phase: "start"`, `scopeResolver: 2`, and scope counts derived from existing resolved files

#### Scenario: Measures event at task end
- **WHEN** runner finishes an attempt after matching files were added, modified, or deleted
- **THEN** it emits `phase: "end"` with resolver version 2, start fields, changed counts, and before/after hashes over the union of both resolved snapshots

#### Scenario: Single emission path
- **WHEN** resolver-versioned measures events are emitted
- **THEN** exactly one code path (`emitMeasures`) produces both start and end events

#### Scenario: Raw-only storage
- **WHEN** measures events are emitted
- **THEN** event data contains observed counts and hashes only, with rates and aggregates deferred to reporting

### Requirement: Emitted verify_ran event exit code and duration
<!-- source: src/core/verification.ts, src/harness/types.ts, src/watcher/verify.ts, src/watcher/change-verify.ts, src/watcher/runner.ts -->
The task, incremental change, scope-audit, and archive verification gates SHALL
execute commands through one core process implementation that returns command,
exit code, duration, output, and timeout state. Watcher callers SHALL emit
`verify_ran` events through the single watcher verification entrypoint. Core
verification SHALL NOT import watcher or harness modules.

#### Scenario: Verified task event fields
- **WHEN** task verification succeeds
- **THEN** runner emits a `verify_ran` event containing `command`, `exitCode: 0`, wall-clock `duration`, and captured output when present

#### Scenario: Failed task event fields
- **WHEN** task verification exits with non-zero code or times out
- **THEN** runner emits a `verify_ran` event containing `command`, non-zero `exitCode`, elapsed `duration`, captured output, and timeout state

#### Scenario: Incremental change verification attribution
- **WHEN** runner executes the proposal verify after a passing task verify
- **THEN** the same watcher verification entrypoint appends its `verify_ran` event to the established change-level target

#### Scenario: Single verification event emission path
- **WHEN** watcher verification or explicit scope recertification executes a verify command
- **THEN** both use the same timeout-bounded core process implementation without violating core import isolation

### Requirement: Done marker scope hash frontmatter
<!-- source: src/watcher/outcome.ts, src/watcher/regression.ts, src/core/scope.ts, src/core/scope-hash.ts, src/core/retry.ts -->
The engine SHALL record YAML frontmatter in `.run/done/<n>` markers comprising
`scope_resolver: 2`, the post-task aggregate hash over resolved scope files,
per-file scope hashes, osq's commit as `build_stamp`, the project commit as
`project_commit`, and verification exit code. Human
recertification SHALL preserve completion and build metadata while retaining
the first trusted hash as `original_scope_hash`, refreshing `scope_hash` and
`scope_files`, recording resolver version 2 and `recertified_at`, and
incrementing `recertification_count`.

#### Scenario: Done marker frontmatter emission
- **WHEN** a task successfully verifies and finishes
- **THEN** `.run/done/<n>` contains `scope_resolver: 2`, `scope_hash`, `scope_files`, `build_stamp`, `project_commit`, and `exit_code: 0`, followed by the ISO completion timestamp

#### Scenario: Passing recertification
- **WHEN** human retry verification passes for a scope-regressed task
- **THEN** canonical done metadata retains its original completion and build values, preserves the first original hash, and records resolver-2 current hashes plus recertification time and count

#### Scenario: Scope hash stability across task completions
- **WHEN** equivalent exact and glob declarations are fingerprinted at completion or recertification
- **THEN** the aggregate hash derives deterministically from sorted resolved project-relative paths and their UTF-8 SHA-256 content digests

### Requirement: Pre-spawn scope comparison and regression detection
<!-- source: src/watcher/regression.ts, src/watcher/loop.ts, src/watcher/runner.ts -->
Before acquiring the upcoming task's lock, the watcher cycle SHALL audit all
earlier completed automated tasks' recorded scope hashes against the current
tree. Scope auditing SHALL NOT run from inside `runTask`.

#### Scenario: Pre-spawn scope hash comparison passes
- **WHEN** every earlier done task retains its recorded literal scope content
- **THEN** the watcher proceeds to `runTask` and ordinary atomic lock acquisition

#### Scenario: Scope regression detected prior to task spawn
- **WHEN** any earlier done task has a changed, added, or deleted recorded file
- **THEN** the watcher records every stale task and returns `blocked_by_regression` without locking or counting the upcoming task

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
<!-- source: src/watcher/archiver.ts, src/watcher/archive-verify.ts, src/watcher/verify.ts, src/harness/types.ts, tests/archive-verification.test.ts, tests/plan-prompt-lifecycle.test.ts, tests/archive-verify-path-missing.test.ts, tests/regressed-missing-paths.test.ts -->
Before archiving, the watcher SHALL re-run every task and change-level
verification against the final tree after scope recertification. A command
naming a missing path SHALL NOT run; its regression SHALL carry reason
`verify_path_missing` and the paths as `missingPaths`. When all gates pass, it
SHALL delete root-level `plan-prompt.md`, apply deltas, relocate the folder,
project completed checkboxes, and record the archive event. The transient prompt
SHALL not affect any archive tree hash.

#### Scenario: Archive verification passes and seals change
- **WHEN** every task verification and the change-level verify command pass against the final tree
- **THEN** the archiver removes the transient prompt, applies deltas, and relocates the change to the archive

#### Scenario: Task verification regression blocks archive
- **WHEN** any task verification command fails during archive preflight
- **THEN** the watcher records the established task regression and leaves the change and prompt unarchived

#### Scenario: Change-level verification regression blocks archive
- **WHEN** the change-level verify command fails during archive preflight
- **THEN** the watcher records the established change regression and leaves the change and prompt unarchived

#### Scenario: Archive succeeds with a prompt file
- **WHEN** every final-tree verification passes and `plan-prompt.md` exists
- **THEN** the archived change omits the prompt while retaining authored artifacts and runtime records

#### Scenario: Archive verification fails
- **WHEN** a task or change-level final verification fails
- **THEN** the active change and its prompt remain available for diagnosis and no archive event is written

#### Scenario: Named path missing at archive
- **WHEN** a done task's verify names a file that no longer exists
- **THEN** that task gets a regressed marker with reason `verify_path_missing` listing the path, its `regressed` event carries `missingPaths` with the path and no `differingPaths`, the command does not run, and the change stays unarchived

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
The optional osq-owned interactive usage port SHALL continue to read the one
session created during an explicit `--session` interval and return independently
nullable token and cost fields without changing process outcome. Codex and
OpenCode implementations SHALL share their confirmed local parsing and usage
mapping with approval-time discovery while applying the caller's distinct
working-directory or edit-path and time-window predicates. AGY SHALL retain
all-null owned usage until a confirmed local artifact exists.

#### Scenario: Exact OpenCode usage
- **WHEN** exactly one matching OpenCode session row exposes usage and cost
- **THEN** the reader returns stored values with cached tokens equal to cache-read plus cache-write counters

#### Scenario: Exact Codex usage
- **WHEN** exactly one matching Codex rollout exposes cumulative thread usage
- **THEN** the reader returns input, output, cached-input, and reasoning-output counters with null cost when none is recorded

#### Scenario: AGY usage unavailable
- **WHEN** AGY completes an explicit interactive planning session
- **THEN** its reader returns null usage and cost while generic lifecycle timing remains recorded

#### Scenario: Explicit session usage is available
- **WHEN** exactly one owned interactive session exposes confirmed usage in its launch interval
- **THEN** its lifecycle record contains the existing observed token and cost mapping

#### Scenario: Usage unavailable or ambiguous
- **WHEN** no unique owned-session artifact supplies a usage field
- **THEN** that field remains null and osq performs no estimation

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
<!-- source: src/core/lifecycle/retry.ts, src/core/lifecycle/retry-transition.ts, src/core/status/layout.ts, src/core/run/scope-hash.ts, src/core/run/verification.ts, src/watcher/**, tests/retry*.test.ts -->
Retry SHALL be the sole transition that retires an active dead or regressed
marker, whether a human or the watcher requests it. It SHALL rename rather than
delete active artifacts using the next target-wide ordinal across retained dead
and regressed failures.

For a numeric `scope_regression` with an automated done marker, retry SHALL
first run the task verify under the configured timeout. A pass SHALL retain and
refresh canonical done while retiring only the regression marker. A failure
SHALL retain both regression and done under inactive attempt names so the task
derives pending. Other task regressions SHALL retain both artifacts and requeue
as before. A change-level retry SHALL accept literal `change` and make archive
verification eligible again.

#### Scenario: Dead marker retained
- **WHEN** a task's first active dead marker is retried
- **THEN** `dead/<n>.md` becomes `dead/<n>.1.md` and the task becomes pending without deleting diagnostics

#### Scenario: Scope regression passes recertification
- **WHEN** retry verification exits zero for an active scope regression
- **THEN** the regression marker is retained under its next ordinal while refreshed `done/<n>` remains canonical

#### Scenario: Scope regression fails recertification
- **WHEN** retry verification exits non-zero or times out for an active scope regression
- **THEN** both active regression and completion markers are retained under the same next ordinal and the task becomes pending

#### Scenario: Regressed completion retained
- **WHEN** a non-scope regressed numeric task has an active done marker
- **THEN** retry retains both failure and completion markers under inactive attempt names before the task runs again

#### Scenario: Change regression retained
- **WHEN** the change target is retried
- **THEN** `regressed/change.md` becomes its next attempt-suffixed historical marker

#### Scenario: Automatic retry uses the same transition
- **WHEN** the watcher retries a dead task automatically
- **THEN** the marker is retained under the same next ordinal as a manual retry would use and the approval check applies unchanged

### Requirement: Retry attempt lifecycle events
<!-- source: src/harness/types.ts, src/core/lifecycle/retry.ts, src/watcher/spawn.ts, tests/retry*.test.ts, tests/golden-events.test.ts -->
The lifecycle event union SHALL include a typed `retry` event carrying target,
reason, next execution attempt, and `automatic: true` when the watcher requested
it, and a typed `stuck` event carrying task and fingerprint. Every newly emitted
`started` event SHALL carry its execution attempt. Initial execution is attempt
1, and the first start after retry SHALL match the attempt in the preceding
retry event. Legacy started events without attempt SHALL remain readable.

#### Scenario: Initial attempt
- **WHEN** the runner spawns a task without retained failure history
- **THEN** its started event contains `attempt: 1`

#### Scenario: Retried attempt
- **WHEN** retry records the next attempt and the watcher later spawns the task
- **THEN** the target event stream contains retry followed by started with the same attempt

#### Scenario: Manual retry event
- **WHEN** a human runs `osq retry`
- **THEN** the `retry` event carries no `automatic` field

### Requirement: Retried executor context
<!-- source: src/harness/types.ts, src/harness/prompt.ts, src/watcher/attempt.ts, src/watcher/spawn.ts, tests/harness-prompt-injection.test.ts, tests/retry-attempts.test.ts -->
The runner SHALL reconstruct retry and requeued-recertification context from
append-only state and pass the attempt, failure reason, and failure output
through shared spawn options. After a manual or automatic retry of a dead task,
the output SHALL be the body of the dead marker that retry retained, with ANSI
codes stripped. Every textual harness prompt SHALL render one prior-context
section with the attempt, reason, output bounded at 2,000 characters, and
existing prior result. Retry SHALL NOT remove the result before spawn.

#### Scenario: Fresh process receives retry context
- **WHEN** the watcher restarts after ordinary retry and later spawns the task
- **THEN** the executor prompt identifies the retry attempt, retained failure reason, the retained marker's body, and prior result path

#### Scenario: Fresh process receives recertification failure
- **WHEN** the watcher restarts after failed recertification and later spawns the task
- **THEN** every textual harness prompt includes its next attempt and captured verification output without relying on process memory

#### Scenario: Automatic retry context
- **WHEN** the watcher retries a dead task automatically
- **THEN** the next prompt contains the retained marker's body exactly as after a manual retry

### Requirement: Rejection lifecycle record
<!-- source: src/core/reject.ts, src/harness/types.ts, tests/reject.test.ts -->
A successful rejection SHALL write `.run/rejected.md` in the moved folder and
append one typed `rejected` event to `.run/events/change.jsonl`. Both artifacts
SHALL record the same non-empty reason and ISO timestamp while all pre-existing
events and run artifacts remain intact.

#### Scenario: Rejection is recorded after relocation
- **WHEN** an eligible change moves to the rejected directory
- **THEN** its destination contains a matching rejection marker and change-level event after all previous event bytes

### Requirement: Scope recertification audit
<!-- source: src/core/scope.ts, src/core/scope-hash.ts, src/core/verification.ts, src/watcher/regression.ts, src/watcher/loop.ts, src/harness/types.ts, tests/scope-recertification.test.ts, tests/scope-resolver-upgrade.test.ts -->
Before locking an upcoming task, the watcher SHALL compare every earlier
automated done task's recorded resolver-aware scope hash and resolver version
with the current tree in one audit. Every stale task SHALL run its own verify
command under the configured verify timeout. A stale task that automatic scope
recertification recertifies SHALL be done again. Every other stale task SHALL
receive an active regression marker and typed regression event containing
sorted differing paths, verification command and result, recorded and current
scope hashes, resolver upgrade context, and per-path attribution whether
verification passed or failed.

A differing path SHALL be attributed to a later done task only when exactly one
later task's normalized file-change events name a resolver-produced path and
the current file hash agrees with that task's resolver-produced completion hash
when available. Multiple qualifying tasks SHALL be `ambiguous`; absence of a
trustworthy candidate SHALL be `unknown`.

An active regression marker SHALL make later audits idempotent. Any newly
regressed task SHALL return `blocked_by_regression` without locking, running,
counting, or writing failure state for the upcoming task. Logging SHALL contain
one stale-task line followed by one numerically ordered change summary.

#### Scenario: More than one completed task is stale
- **WHEN** multiple earlier done tasks differ from their recorded resolved scopes before another task is due
- **THEN** every stale task is verified and recorded in one audit while the upcoming task remains unlocked and excluded from `tasksRun`

#### Scenario: Resolver version is stale
- **WHEN** an automated active done marker lacks `scope_resolver: 2` even though its aggregate hash matches
- **THEN** detection verification runs once and records a scope regression with resolver-upgrade context and no invented differing file path

#### Scenario: Detection verification times out
- **WHEN** a stale task's verify command exceeds `verifyTimeoutSeconds`
- **THEN** its marker and event retain the timeout result and the change halts for human recertification

#### Scenario: Halted cycle repeats
- **WHEN** another watcher cycle observes the same active scope regression markers
- **THEN** it writes no duplicate markers or events and does not re-run detection verification

#### Scenario: Later edit attribution
- **WHEN** normalized file-change and resolver-produced completion evidence identifies one later done task for a differing path
- **THEN** the marker and event name that task, otherwise recording `ambiguous` or `unknown` according to the evidence

#### Scenario: Automatically recertified task
- **WHEN** the only stale task qualifies for automatic scope recertification
- **THEN** the audit reports no regressed task and the upcoming task runs

### Requirement: Archive scope recertification audit
<!-- source: src/watcher/archiver.ts, src/watcher/regression.ts, tests/archive-verification.test.ts -->
Before the existing archive-time task and change verification sequence, the
archiver SHALL run the scope recertification audit across every automated done
task. Any stale task SHALL halt archival after all stale tasks are recorded and
before the ordinary archive verifier begins. Matching scopes SHALL proceed into
the existing archive verification semantics unchanged.

#### Scenario: Final task changes an earlier scope
- **WHEN** all tasks are done but a final-task edit changed an earlier task's recorded file
- **THEN** the earlier task is verified and marked regressed, no ordinary archive verify begins, no archived event is emitted, and the folder remains active

#### Scenario: Completed scopes still match
- **WHEN** every automated done marker agrees with the final tree
- **THEN** ordered task verification, change verification, delta application, and archival proceed unchanged

### Requirement: Scope recertification lifecycle event
<!-- source: src/harness/types.ts, src/core/retry.ts, src/core/lifecycle/recertify.ts, src/watcher/auto-recertify.ts, src/watcher/attempt.ts, src/watcher/spawn.ts, tests/retry-recertification.test.ts, tests/auto-recertify.test.ts -->
The lifecycle event union SHALL include a typed `recertification` event carrying
task, outcome, differing paths and attribution, verify command, exit code,
output and timeout state, recorded or original scope hash, and current scope
hash. Outcome SHALL be `passed` when human retry or automatic scope
recertification refreshes the trusted done record and `requeued` when failed
verification returns the task to agent work. An automatic recertification's
event SHALL carry `automatic: true`; a human one SHALL carry no `automatic` key.

A passed recertification SHALL not advance execution attempts. A requeued
recertification SHALL retain the next execution attempt and failed verification
context in append-only state so a restarted watcher supplies them to the next
executor.

#### Scenario: Human recertification passes
- **WHEN** explicit retry verification exits zero for a scope-regressed task
- **THEN** one `recertification` event records `outcome: passed` without a retry, started event, or execution-attempt increment

#### Scenario: Human recertification requeues
- **WHEN** explicit retry verification exits non-zero or times out
- **THEN** one `recertification` event records `outcome: requeued` and preserves the next attempt and failing output for a later agent spawn

#### Scenario: Automatic recertification event
- **WHEN** the watcher recertifies a task automatically
- **THEN** one `recertification` event records `outcome: passed` and `automatic: true` without a retry, started event, or execution-attempt increment

### Requirement: Deterministic task scope resolution
<!-- source: src/core/scope.ts, src/core/scope-hash.ts, tests/scope-resolver.test.ts, tests/runner-scope-hashes.test.ts -->
Every subsystem that interprets task scope against the project tree SHALL use
one core resolver. The resolver SHALL support exact paths and the established
`*`, `**`, `?`, and trailing-directory glob forms without negative patterns or
a runtime glob dependency.

Results SHALL contain deduplicated, sorted project-relative POSIX paths. An
existing regular file SHALL resolve to a readable file path, a missing exact
entry SHALL remain represented with null, and a glob with no existing matches
SHALL contribute no entry. Resolution SHALL remain inside the project root and
be deterministic for the same declarations and tree.

#### Scenario: Exact and glob scope overlap
- **WHEN** multiple declarations resolve to the same existing file
- **THEN** the resolver returns the normalized file once in lexical order

#### Scenario: Missing exact and unmatched glob
- **WHEN** one exact path is absent and one glob matches no file
- **THEN** the absent exact path is retained with null and the glob contributes no path

#### Scenario: Glob hash membership changes
- **WHEN** matching files are added, modified, and deleted between two hashes
- **THEN** aggregate comparison reports each normalized path as added, modified, or deleted

### Requirement: Approval-time local planning observation
<!-- source: src/core/report/planning-observed.ts, src/core/report/planning-slice.ts, src/core/report/planning-slice-turns.ts, src/core/spec/approve.ts, src/harness/claude/claude-usage.ts, src/harness/codex/codex-observe-usage.ts, src/harness/opencode/opencode-observe-usage.ts, tests/planning-observed-match.test.ts, tests/planning-observed-approve.test.ts -->
`findPlanningSessions` SHALL ask every available Codex, OpenCode, and Claude
Code local reader for sessions with at least one turn edit whose normalized
target is within the selected change folder and whose turn timestamp is
inclusively between folder creation and observation time. Path matching SHALL
be segment-aware. A matched session SHALL be reduced to the turns the change
owns under planning turn attribution. Readers SHALL degrade missing stores and
malformed records to no match or null.

Readers SHALL inspect only metadata, usage, timestamps, tool names, versions,
and file-path arguments, SHALL never retain transcript content or send data off
the machine, and SHALL never estimate a missing value.

#### Scenario: Supported session edits the change
- **WHEN** one local session has an in-window edit under the change and another does not
- **THEN** discovery returns exactly the matching session, reduced to the turns the change owns

#### Scenario: Local artifacts are unavailable
- **WHEN** stores are absent, malformed, unreadable, or contain no qualifying edit
- **THEN** discovery returns no match without changing approval success

### Requirement: Mixed-source planning lifecycle records
<!-- source: src/core/report/planning-observed.ts, src/core/report/planning-records.ts, tests/planning-observed-approve.test.ts, tests/planning-observed-records.test.ts -->
Observed matches SHALL be appended to `.run/plan.jsonl` as correlated
`PlanRecord` pairs carrying `source: observed`; owned records carry `source:
owned` and legacy records without source read as owned. An observed session
SHALL be appended once per change. Its `plan_started` and `plan_exited`
timestamps SHALL be the first and last owned turn, `wallSeconds` their span,
and `usage` the owned turns' sums. `plan_exited.data.slice` SHALL record the
slice bounds, approval time, last edit time, turn count, active minutes, tokens
by kind, and cost source.

#### Scenario: First approval observes a session
- **WHEN** discovery returns a native session not present in the planning log
- **THEN** one correlated observed pair is appended with its stable identity, slice bounds, and slice fields

#### Scenario: Reapproval observes the same session
- **WHEN** the same native session is returned again
- **THEN** the append-only log remains byte-identical and planning session count is unchanged

#### Scenario: Legacy exit record
- **WHEN** a `plan_exited` record has no `slice` field
- **THEN** it parses as before and its slice reads as absent

### Requirement: Shared executor prompt
<!-- source: src/harness/prompt.ts, src/harness/agy/agy.ts, src/harness/opencode/opencode.ts, src/harness/codex/codex-prompt.ts, tests/harness-prompt-injection.test.ts, tests/fixtures/prompts/** -->
Every textual harness SHALL deliver the prompt `buildExecutorPrompt` returns,
byte for byte, and SHALL keep its own delivery, arguments, and attachments. The
prompt SHALL name the task file, `proposal.md`, title, scope, entry files,
verification command, result destination, prior context, delta spec paths, and
living spec paths, then the managed executor steps, capability rules, managed
exit text, and the concrete result path. It SHALL NOT name `features/` or a
parent `spec.md`.

#### Scenario: Same task, three harnesses
- **WHEN** agy, codex, and opencode build argv for the same fixture task
- **THEN** each carries the same prompt text, equal to its checked-in golden prompt

#### Scenario: Specs named for every harness
- **WHEN** a change writes a delta spec and its proposal reads a living capability that exists
- **THEN** every harness prompt lists the delta spec path under `Delta Specs:` and the living spec path under `Living Capability Specs:`

#### Scenario: Managed text reaches the prompt
- **WHEN** a harness prompt is built
- **THEN** it contains every managed executor step line and every managed exit line verbatim

### Requirement: Pi task execution
<!-- source: src/harness/pi/**, src/harness/index.ts, tests/pi/** -->
The Pi adapter SHALL implement the existing `HarnessAdapter` port without new
methods and SHALL run each task as a fresh process in the project root with
stdin closed. Its arguments SHALL be `--mode json --no-session --no-approve
--offline --no-extensions --no-skills --no-prompt-templates`, then `--provider`,
`--model`, and `--thinking` when each is configured, then `--` and the prompt
`buildExecutorPrompt` returns as one literal argument. Setup SHALL write no Pi
files.

#### Scenario: Configured arguments
- **WHEN** a task spawns with `pi.provider`, `pi.model`, and `pi.thinking` set
- **THEN** Pi receives exactly those arguments in that order, runs in the project root with stdin closed, and receives the shared executor prompt byte for byte

#### Scenario: Native model
- **WHEN** no provider, model, or thinking level applies
- **THEN** those flags are omitted and execution metadata records `default`

### Requirement: Pi preflight
<!-- source: src/harness/pi/**, src/core/foundation/config-pi.ts, tests/pi/** -->
Pi preflight SHALL probe `--version` under `timeouts.harnessPreflightSeconds`
and warn when the version is outside the tested range. When `pi.provider` is
set, it SHALL fail before any task spawns unless `pi auth check --provider
<name> --json` reports `ready`, printing the provider and reason.

#### Scenario: Credentials not ready
- **WHEN** `pi.provider` is set and `pi auth check` reports `not_ready`
- **THEN** preflight fails naming the provider and reason, and no task spawns

#### Scenario: No provider
- **WHEN** `pi.provider` is not set
- **THEN** preflight runs no auth check

### Requirement: Pi stream reading
<!-- source: src/harness/pi/**, src/harness/stream.ts, tests/pi/** -->
The adapter SHALL read stdout continuously through the shared LF-only
`EventStreamParser`, tolerate a trailing carriage return, and skip malformed or
unknown records without aborting. The run SHALL end at `agent_settled` or
process exit, whichever comes first.

#### Scenario: Line separator inside a string
- **WHEN** a record contains U+2028 inside a JSON string
- **THEN** it parses as one record and its observation is recorded

#### Scenario: Retry before settling
- **WHEN** `agent_end` is followed by `auto_retry_start`, more turns, and `agent_settled`
- **THEN** the observations after the retry are still recorded

### Requirement: Pi event translation
<!-- source: src/harness/pi/**, tests/pi/**, tests/fixtures/pi/** -->
Each `tool_execution_start` SHALL become a `tool` event with a project-relative
summary. Each assistant `message_end` SHALL become a `text` event for its
non-empty text and one `tokens` event with `input` as `promptTokens`, `output`
as `candidateTokens`, `cacheRead` as `cachedTokens`, `reasoning` as
`reasoningTokens`, `totalTokens`, `cost.total` as `cost`, and the message's
`provider` and `model`. Each successful `edit` or `write` SHALL become a
`file_changed` event.

#### Scenario: Several responses
- **WHEN** one run contains three assistant `message_end` records with usage
- **THEN** three `tokens` events are written and the report's token and cost totals equal their sums

#### Scenario: Captured run
- **WHEN** `tests/fixtures/pi/run.jsonl` is replayed
- **THEN** it yields one `tool` event per `tool_execution_start` and one `tokens` event per assistant `message_end`

### Requirement: Harness retry events
<!-- source: src/harness/types.ts, src/harness/pi/**, tests/pi/** -->
Each Pi `auto_retry_start` and `auto_retry_end` SHALL become a `harness_retry`
event carrying `phase` (`start` or `end`) and `attempt`, plus `maxAttempts`,
`delayMs`, `success`, and `error` when Pi reports them.

#### Scenario: One retry
- **WHEN** a run contains one `auto_retry_start` and one `auto_retry_end`
- **THEN** two `harness_retry` events are written, with phases `start` and `end`

### Requirement: Pi failure and result handling
<!-- source: src/harness/pi/**, src/watcher/spawn.ts, src/watcher/verify.ts, tests/pi/** -->
A non-zero Pi exit SHALL become the existing crashed dead letter carrying Pi's
stderr; when stderr says no API key was found, the message SHALL also name
`pi auth check --provider <name>`. When Pi writes `agent_settled` but does not
exit within `timeouts.harnessKillGracePeriodMs`, the adapter SHALL stop it and
report success. A missing result file SHALL follow the watcher's existing
synthesis and `no_result` path.

#### Scenario: Missing credentials
- **WHEN** Pi prints the session header, writes `No API key found for the selected model.` to stderr, and exits 1
- **THEN** the task's dead letter records `crashed` with that stderr and names `pi auth check`

#### Scenario: Lingering after settling
- **WHEN** Pi writes `agent_settled` and keeps running
- **THEN** the adapter stops it after the kill grace and the watcher goes on to verification

### Requirement: Pi execution attribution
<!-- source: src/harness/types.ts, src/harness/pi/**, src/watcher/spawn.ts, tests/pi/** -->
`SpawnTaskOptions.onSpawn` SHALL accept optional spawn details, and the runner
SHALL add a supplied `harnessVersion` to the `started` event. The Pi adapter
SHALL supply the first line of `pi --version`. `started.model` and the approval
manifest SHALL record `pi.model`, the `OSQ_MODEL` fallback, or `default`, and
the manifest SHALL record `pi.thinking` as effort, or null.

#### Scenario: Pi started event
- **WHEN** a Pi task starts
- **THEN** its `started` event carries `harness: "pi"`, the configured model or `default`, and `harnessVersion`

#### Scenario: Other harnesses unchanged
- **WHEN** an adapter calls `onSpawn` with a PID only
- **THEN** its `started` event is unchanged and carries no `harnessVersion`

### Requirement: Pre-spawn verify check
<!-- source: src/watcher/task-verify.ts, src/watcher/runner.ts, src/watcher/verify.ts, src/watcher/attempt.ts, src/harness/types.ts, tests/pre-spawn-verify.test.ts -->
On a task's first attempt, unless `gates.preSpawnVerify` is `off`, the runner
SHALL run the task's `verify` under `timeouts.verifyTimeoutSeconds` after the
preexisting-test snapshot and before execution measures or the agent start. The
attempt SHALL be the one `readRetryContext` reconstructs from the task's event
stream. Retried and requeued attempts SHALL NOT run the check, and archive-time
and scope-audit verification SHALL NOT emit pre-spawn events.

#### Scenario: Red start as expected
- **WHEN** a task expecting `red` starts its first attempt and its verify fails
- **THEN** a `verify_ran` event with `phase: "pre_spawn"`, `expected: "red"`, and `mismatch: false` precedes the `started` event and the agent spawns

#### Scenario: Check disabled
- **WHEN** `gates.preSpawnVerify` is `off`
- **THEN** no pre-spawn verify runs and no pre-spawn event is written

#### Scenario: Later attempts
- **WHEN** a task runs as attempt 2 or later after a retry or a requeued recertification
- **THEN** no pre-spawn verify runs for that attempt

### Requirement: Pre-spawn verify event and mismatch handling
<!-- source: src/watcher/task-verify.ts, src/core/status/pre-spawn-words.ts, src/watcher/verify.ts, src/harness/types.ts, tests/pre-spawn-verify.test.ts, tests/pre-spawn-words.test.ts, tests/verify-path-missing.test.ts -->
The pre-spawn run SHALL append one `verify_ran` event through the single
watcher verification entrypoint, adding `phase: "pre_spawn"`, `expected` (the
task's `verify_starts`), `missingPaths` (the named paths absent before spawn,
only when any is), and a boolean `mismatch`. A mismatch SHALL be a pass when `red` is expected and
no named path is missing, or a failure or timeout when `green` is expected; `any`
never mismatches. Under `fail` a mismatch SHALL kill the task with
`verify_precondition`.

Under `warn` and `fail` the watcher SHALL log one line per pre-spawn result,
`task <n> ` followed by the start words from `formatPreSpawnStart` in
`src/core/status/pre-spawn-words.ts`: a start is red when verify fails or a
named path is missing, worded `started red: <path>, <path> missing` when paths
are missing and `started red: verify fails` otherwise, and green worded
`started green, as declared`. A mismatch SHALL replace `, as declared` with
nothing and append `, but it declared <state>`. A matching start SHALL log at
info level and a mismatch at warn level.

#### Scenario: Green start under warn
- **WHEN** a task expecting `red` starts its first attempt, its verify passes, no named path is missing, and `gates.preSpawnVerify` is `warn`
- **THEN** the pre-spawn event records `mismatch: true`, the logger receives one warning `task <n> started green, but it declared red`, and the task proceeds through its normal gates

#### Scenario: Green start under fail
- **WHEN** a task expecting `red` starts its first attempt, its verify passes, no named path is missing, and `gates.preSpawnVerify` is `fail`
- **THEN** the task dies with `verify_precondition`, the agent never spawns, and no `started` event is written

#### Scenario: Declared green start
- **WHEN** a task declaring `verify_starts: green` starts its first attempt and its verify passes
- **THEN** the pre-spawn event records `mismatch: false` and the log prints `task <n> started green, as declared`

#### Scenario: Green only because the new test is missing
- **WHEN** a task expecting `red` names a missing test file next to an existing one and its verify passes before spawn
- **THEN** the pre-spawn event records that file in `missingPaths` and `mismatch: false`, and the log prints `task <n> started red: <path> missing`

#### Scenario: Red start because verify fails
- **WHEN** a task expecting `red` names no missing path and its verify fails before spawn
- **THEN** the log prints `task <n> started red: verify fails`

#### Scenario: Red start against a green declaration
- **WHEN** a task declaring `verify_starts: green` fails its verify before spawn under `warn`
- **THEN** the log warns `task <n> started red: verify fails, but it declared green`

### Requirement: Per-turn planning readers
<!-- source: src/harness/claude/claude-usage.ts, src/harness/claude/claude-turns.ts, src/harness/codex/codex-observe-usage.ts, src/harness/opencode/opencode-observe-usage.ts, src/harness/opencode/opencode-usage.ts, tests/planning-observed-claude.test.ts, tests/planning-observed-codex.test.ts, tests/planning-observed-opencode.test.ts, tests/planning-reader-shape.test.ts -->
Each planning reader SHALL return, per native session, the harness version
when known, a whole-session reported cost when the harness records one, and one
turn per model response, and SHALL NOT return session-level usage, edits, or
start and end times. A turn SHALL carry its timestamp, model, independently
nullable input, output, cache-read, cache-write, and reasoning tokens, a
nullable reported cost, and its successfully edited paths. Input SHALL exclude
cached input. A session whose records cannot be parsed SHALL yield null usage.

#### Scenario: Claude message split across records
- **WHEN** a Claude transcript holds three assistant records with one `message.id` and the same `message.usage`
- **THEN** the reader returns one turn with that usage counted once, timestamped at the earliest record

#### Scenario: Claude transcript without cost-state
- **WHEN** a Claude transcript has assistant usage and no `cost-state` record
- **THEN** its turns carry token usage and the session's whole-session cost is null

#### Scenario: Claude cost-state
- **WHEN** a Claude transcript has a `cost-state` record
- **THEN** its `totalCostUSD` becomes the whole-session cost and its counters are not used as turn usage

#### Scenario: Codex responses
- **WHEN** a Codex rollout holds `token_count` events with `last_token_usage` and duplicate `token_usage_record` lines
- **THEN** each `token_count` becomes one turn, duplicates add nothing, input excludes `cached_input_tokens`, and edits from successful `apply_patch` calls or `patch_apply_end` events attach to the turn that follows them

#### Scenario: OpenCode messages
- **WHEN** the OpenCode database holds assistant messages with tokens, cost, and completed write or edit parts
- **THEN** each assistant message becomes one turn with its tokens, reported cost, and edited paths, read through `message.session_id` and `part.message_id`

#### Scenario: Unparseable session
- **WHEN** a transcript's records carry malformed usage or no parseable usage at all
- **THEN** the affected turns carry null usage and approval still succeeds

#### Scenario: Session shape
- **WHEN** any reader returns a session
- **THEN** the session has `turns` and no `usage`, `edits`, `startedAt`, or `endedAt` key

### Requirement: Automatic retry
<!-- source: src/watcher/auto-retry.ts, src/watcher/loop.ts, src/core/lifecycle/retry.ts, tests/auto-retry.test.ts, tests/verify-path-missing.test.ts -->
Each cycle, for every dead task in an approved change, the watcher SHALL retry
the task through `retrySpec` with `automatic: true` when its dead reason is
eligible, it is not stuck, and it has fewer automatic retries than
`gates.autoRetries` since the later of the manifest's `approvedAt` and its last
manual retry. Eligible reasons SHALL be `verify_red`, `change_verify_red`,
`undeclared_test_change`, `verify_path_missing`, `denied_dependency`,
`no_result`, `crashed`, and `timeout`.

#### Scenario: Retry fixes the task
- **WHEN** a task dies with `verify_red` and passes on its next attempt
- **THEN** it reaches done with exactly one `retry` event carrying `automatic: true`, and the watcher printed one automatic-retry line

#### Scenario: Missing verify path is retried
- **WHEN** a task dies with `verify_path_missing`
- **THEN** it is retried automatically once and the next attempt's prompt contains the missing path

#### Scenario: Denied dependency is retried
- **WHEN** a task dies with `denied_dependency` for `vue`
- **THEN** it is retried automatically once and the next attempt's prompt contains `vue`

#### Scenario: Ineligible reason
- **WHEN** a task dies with `spec_conflict`, `already_running`, or `verify_precondition`
- **THEN** it stays dead and no automatic `retry` event is appended

#### Scenario: Count exhausted
- **WHEN** a task that already had one automatic retry dies again with a new fingerprint and the count is 1
- **THEN** it stays dead until a human runs `osq retry`, after which it may be retried automatically once more

#### Scenario: Disabled
- **WHEN** `gates.autoRetries` is 0
- **THEN** no automatic retry happens, no task is marked stuck, and dead tasks behave as before

#### Scenario: Restart between death and retry
- **WHEN** the watcher stops after a death is recorded and before the retry, then starts again
- **THEN** the task is retried exactly once and runs once more

#### Scenario: Once mode
- **WHEN** `osq watch --once` performs an automatic retry
- **THEN** it continues and runs the retried task before exiting

### Requirement: Dead marker fingerprint
<!-- source: src/watcher/fingerprint.ts, src/watcher/outcome.ts, src/watcher/runner.ts, src/watcher/spawn.ts, src/watcher/loop.ts, tests/dead-fingerprint.test.ts -->
Every dead marker's frontmatter SHALL record `fingerprint: sha256:<hex>`,
hashed over the reason and the marker body after stripping ANSI codes and
replacing ISO timestamps, durations including a number after a duration key,
PIDs, absolute paths under the project root, and paths under the temp directory
with fixed placeholders. A temp path, matched by `os.tmpdir()` and its real
path, keeps what follows its first segment: `/tmp/x-Hf38F/a.db` becomes
`<tmp>/a.db`.

#### Scenario: Volatile details
- **WHEN** two markers with the same reason differ only in timestamps, durations, PIDs, ANSI codes, temp directory names, or the project root path
- **THEN** their fingerprints are equal

#### Scenario: Repeated node:test failure
- **WHEN** the same failing `node:test` file, creating and printing a `mkdtemp` directory, runs twice and each output becomes a dead marker
- **THEN** the two markers have the same fingerprint

#### Scenario: Different failures
- **WHEN** two markers differ in reason, in a failing test name, or in an assertion message
- **THEN** their fingerprints differ

### Requirement: Stuck task detection
<!-- source: src/watcher/auto-retry.ts, src/harness/types.ts, tests/auto-retry.test.ts -->
When automatic retry is enabled and a dead task's fingerprint equals the
fingerprint of its most recent retained dead marker, the watcher SHALL NOT retry
it automatically. It SHALL add `stuck: true` to the active marker, append one
`stuck` event with the task and fingerprint, and print one line, each once per
death. `osq retry` SHALL still retry a stuck task.

#### Scenario: Same failure twice
- **WHEN** a task dies twice with identical output
- **THEN** the second marker is stuck, one `stuck` event is appended, and no third attempt starts

### Requirement: Verify path check
<!-- source: src/watcher/task-verify.ts, src/watcher/runner.ts, src/watcher/failure-reason.ts, src/watcher/outcome.ts, src/core/spec/verify-paths.ts, tests/verify-path-missing.test.ts -->
After the agent exits and its result file is ensured, and before the task
verify runs, the runner SHALL resolve every path the task verify names through
the shared verify-path module. When any is missing, the task SHALL die with
`verify_path_missing` and the verify command SHALL NOT run. The dead marker SHALL
record the reason and command in frontmatter and list each missing path on its
own line in the body.

#### Scenario: New test never written
- **WHEN** a task verify names an existing and a missing test file and the agent writes only its result file
- **THEN** the task dies with `verify_path_missing`, the marker lists the missing file, and no post-spawn `verify_ran` event is written

#### Scenario: New test written
- **WHEN** the same task's agent also writes the missing file
- **THEN** the verify runs and the task reaches done

#### Scenario: Command names no paths
- **WHEN** a task verify is `pnpm verify` or names only options and bare words
- **THEN** no path check fails and the task behaves as before

### Requirement: Claude task execution
<!-- source: src/harness/claude/claude-exec.ts, src/harness/claude/claude-exec-args.ts, src/harness/index.ts, tests/claude/** -->
The Claude adapter SHALL implement the existing `HarnessAdapter` port without
new methods and SHALL run each task as a fresh `claude -p` process in the
project root with stdin closed, no session resume, and
`--output-format stream-json --verbose`. The prompt SHALL be the one
`buildExecutorPrompt` returns, passed as one literal argument after `--`. Setup
SHALL write no Claude Code files.

#### Scenario: Fresh headless process
- **WHEN** a task spawns with harness `claude`
- **THEN** Claude Code runs in the project root with stdin closed, receives `-p --output-format stream-json --verbose` and `--no-session-persistence`, and receives the shared executor prompt byte for byte after `--`

#### Scenario: Configured model
- **WHEN** `claude.model` is set
- **THEN** Claude Code receives `--model` with that value, and without it no `--model` flag is passed and execution metadata records `default`

### Requirement: Claude tool surface
<!-- source: src/harness/claude/claude-exec-args.ts, tests/claude/** -->
Every Claude task SHALL load only the built-in tools `Bash`, `Read`, `Edit`,
`Write`, `Glob`, and `Grep` through `--tools`, no MCP servers through
`--strict-mcp-config` without `--mcp-config`, no skills through
`--disable-slash-commands`, no user, project, or local settings files through
`--setting-sources ""`, and no auto-memory through `--settings` carrying
`"autoMemoryEnabled": false`. A non-empty `ANTHROPIC_API_KEY` SHALL add
`--bare`. No configuration SHALL re-enable any of them.

#### Scenario: Login run
- **WHEN** `ANTHROPIC_API_KEY` is unset or empty
- **THEN** the arguments carry every stripping flag above and no `--bare`

#### Scenario: API key run
- **WHEN** `ANTHROPIC_API_KEY` is non-empty
- **THEN** the arguments also carry `--bare`

### Requirement: Claude permissions and containment
<!-- source: src/harness/claude/claude-exec-args.ts, src/core/foundation/config-claude.ts, tests/claude/** -->
Every Claude task SHALL run with `--permission-mode dontAsk`, the allow rules
`Bash`, `Read`, `Edit(./**)`, `Write(./**)`, `Glob`, and `Grep`, and the deny
rule `Bash(git:*)`. When `claude.sandbox` is true, the `--settings` JSON SHALL
also carry `sandbox` with `enabled: true`, `failIfUnavailable: true`,
`autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, and
`network` with an empty `allowedDomains` and `strictAllowlist: true`.

#### Scenario: Default containment
- **WHEN** `claude.sandbox` is unset or false
- **THEN** the settings JSON is exactly `{"autoMemoryEnabled":false}` and the `git` deny rule is passed

#### Scenario: Sandboxed containment
- **WHEN** `claude.sandbox` is true
- **THEN** the settings JSON carries the sandbox block above, and the `git` deny rule is still passed

### Requirement: Claude stream translation
<!-- source: src/harness/claude/claude-stream.ts, src/harness/claude/claude-tools.ts, tests/claude/**, tests/fixtures/claude/** -->
The adapter SHALL read stdout through the shared LF-only `EventStreamParser`
and skip malformed or unknown records without aborting. Each `tool_use` block
in an `assistant` record SHALL become a `tool` event with a project-relative
summary, and each non-empty `text` block a `text` event. Each `tool_result`
without `is_error: true` for a remembered `Edit` or `Write` SHALL become a
`file_changed` event with the project-relative path.

#### Scenario: Captured run
- **WHEN** `tests/fixtures/claude/run.jsonl` is replayed
- **THEN** it yields one `tool` event per `tool_use` block, one `text` event per non-empty `text` block, and a `file_changed` event for each successful `Write` and `Edit`

#### Scenario: Denied command
- **WHEN** a `Bash` `tool_use` is followed by a `tool_result` with `is_error: true`
- **THEN** the `tool` event is still written and no `file_changed` event is written for it

### Requirement: Claude token accounting
<!-- source: src/harness/claude/claude-stream.ts, tests/claude/**, tests/fixtures/claude/** -->
The `result` record SHALL become one `tokens` event per `modelUsage` entry,
with `inputTokens` plus `cacheReadInputTokens` plus `cacheCreationInputTokens`
as `promptTokens`, `outputTokens` as `candidateTokens`, their sum as
`totalTokens`, `cacheReadInputTokens` as `cachedTokens`, `thinkingTokens` as
`reasoningTokens`, `costUSD` as `cost`, and the entry's key as `model`.
Per-message usage SHALL NOT produce `tokens` events.

#### Scenario: Cost matches the run
- **WHEN** a `result` record has two `modelUsage` entries
- **THEN** two `tokens` events are written and their `cost` values sum to the record's `total_cost_usd`

### Requirement: Claude failure and result handling
<!-- source: src/harness/claude/claude-exec.ts, src/watcher/spawn.ts, src/watcher/verify.ts, tests/claude/** -->
A non-zero Claude Code exit SHALL become the existing crashed dead letter
carrying Claude Code's stderr and, when the stream ended with a `result` whose
`is_error` is true, its `subtype`. A missing result file SHALL follow the
watcher's existing synthesis from the last `text` event and its `no_result`
path.

#### Scenario: Sandbox unavailable
- **WHEN** Claude Code prints `sandbox required but unavailable` to stderr and exits 1
- **THEN** the task's dead letter records `crashed` with that stderr

#### Scenario: Successful run without a result file
- **WHEN** the replayed run exits 0 without writing the result file
- **THEN** the watcher synthesizes it from the last `text` event and marks the task done only after its own verify passes

### Requirement: Claude execution attribution
<!-- source: src/harness/types.ts, src/harness/claude/claude-exec.ts, src/watcher/spawn.ts, tests/claude/** -->
`SpawnDetails` SHALL accept an optional `harnessAuth` of `api_key` or `login`,
and the runner SHALL add a supplied value to the `started` event. The Claude
adapter SHALL supply `api_key` when it passed `--bare` and `login` otherwise,
along with `harnessVersion` from the first line of `claude --version`.

#### Scenario: Claude started event
- **WHEN** a Claude task starts without `ANTHROPIC_API_KEY`
- **THEN** its `started` event carries `harness: "claude"`, the configured model or `default`, `harnessVersion`, and `harnessAuth: "login"`

#### Scenario: Other harnesses unchanged
- **WHEN** an adapter supplies no `harnessAuth`
- **THEN** its `started` event carries no `harnessAuth`

### Requirement: Archived verification requirement
<!-- source: src/watcher/archiver.ts, src/core/spec/human-steps.ts, tests/verification-record.test.ts -->
When an archived change's proposal has after-landing steps or a `check`
command, its `archived` event SHALL carry `verification: { afterLanding, check
}`, where `afterLanding` says whether after-landing steps exist and `check` is
the command or null. Otherwise the event SHALL carry no `verification` key. The
watcher SHALL archive exactly as before in both cases.

#### Scenario: After-landing steps
- **WHEN** a change whose `### After landing` lists a step is archived
- **THEN** its `archived` event carries `verification: { afterLanding: true, check: null }`

#### Scenario: No human steps
- **WHEN** a change whose `## Human steps` reads `None` and has no `check` is archived
- **THEN** its `archived` event carries only `archivePath`, as before

### Requirement: Human verification events
<!-- source: src/core/lifecycle/verification-record.ts, tests/verification-record.test.ts -->
The CLI SHALL append `check_ran` events, with data `command`, `exitCode`,
`duration`, `timedOut`, and `output`, and `verification_recorded` events, with
data `outcome` (`passed` or `failed`) and `note` (text or null), only to an
archived change's `.run/events/change.jsonl`. Their data types SHALL live in
`src/core/lifecycle/verification-record.ts`, as the `rejected` event's shape
lives in core.

#### Scenario: Recorded outcome
- **WHEN** a human records a failed outcome with a note
- **THEN** the archived change's stream gains one `verification_recorded` event with `outcome: "failed"` and the note

### Requirement: Import fan-in from the shared graph
<!-- source: src/watcher/measures.ts, src/core/spec/import-graph.ts, tests/import-graph-build.test.ts, tests/measures.test.ts -->
`countImportFanIn` SHALL count the `src/**/*.ts` files outside the scope that
import a scoped file under `src/`, read from `buildImportGraph`. It SHALL match
whole import specifiers, so an importer of `./codex-prompt.js` does not count
toward `./codex.ts`.

#### Scenario: Prefix-named sibling
- **WHEN** `src/x.ts` imports `./codex-prompt.js` and scope is `src/codex.ts`
- **THEN** `src/x.ts` does not count toward the fan-in

#### Scenario: osq's own repository
- **WHEN** fan-in is counted on this repository for a sample of `src/` files
- **THEN** each count equals a search for whole import specifiers

### Requirement: Blocked exit
<!-- source: src/watcher/blocked.ts, src/watcher/task-verify.ts, src/watcher/runner.ts, src/watcher/failure-reason.ts, tests/blocked-exit.test.ts -->
After the agent exits and the runner has made sure a result file exists, a
result file whose `## Blocked` section `parseResultSections` reads as present
SHALL make the task die with reason `blocked`. The runner SHALL check this
before the missing verify path check, the task verify, and the change verify,
and SHALL run none of them for a blocked task. The dead marker SHALL carry
`reason: blocked` in its frontmatter and the stated need in its body, and one
`dead` event SHALL record reason `blocked`. A `## Blocked` section that is empty
or says only `None` SHALL leave the task to the checks that follow, as before.
`blocked` SHALL NOT be one of the reasons eligible for an automatic retry.

#### Scenario: Executor stops blocked
- **WHEN** a fake agent writes a result file whose `## Blocked` says `Needs src/b.ts in scope` and writes no code
- **THEN** the task dies with `blocked`, the dead marker body holds `Needs src/b.ts in scope`, and no `verify_ran` event follows the agent's exit

#### Scenario: Blocked task is not retried
- **WHEN** a watcher cycle with `gates.autoRetries` of 1 sees a task that died with `blocked`
- **THEN** the task stays dead and no `retry` event is appended

#### Scenario: Blocked says None
- **WHEN** the result file's `## Blocked` says only `None`
- **THEN** the task goes through the missing-path check and verify as before

### Requirement: Automatic scope recertification
<!-- source: src/watcher/auto-recertify.ts, src/watcher/regression.ts, src/watcher/loop.ts, src/core/lifecycle/recertify.ts, src/core/lifecycle/retry.ts, src/harness/types.ts, tests/auto-recertify.test.ts -->
When the scope recertification audit finds a stale done task that has no
active regression marker, the watcher SHALL recertify that task without a human
only when it has at least one differing path and, for every differing path, all
of these hold:

1. A later-numbered task in the same change has a resolved approved `scope`
   that covers the path, as `scopeCoversPath` decides.
2. That later task's `measures` end events carry the path from the done task's
   recorded hash to the current hash without a gap: one end event's `before`
   equals the done marker's recorded `scope_files` hash, each later end event's
   `before` equals the previous one's `after`, and the last end event's `after`
   equals the current hash. A missing hash counts as `null`, which means the
   file was absent.
3. The done task's verify passes at detection.

An automatic recertification SHALL refresh the done marker through the same
function `osq retry` uses for a passing recertification. It SHALL append one
`recertification` event with `outcome: passed` and `automatic: true`, carrying
the same differing paths, attribution, verify result, and hashes as a human
recertification. It SHALL write no regression marker and no `regressed` event,
and it SHALL not halt the change. The watcher SHALL log one line per
automatically recertified task. Any other stale task SHALL be recorded and
halt the change exactly as before.

#### Scenario: A later task extends the file
- **WHEN** task 1 finished with `src/a.ts`, task 2's scope covers it, task 2 is the only thing that changed it, and task 1's verify passes
- **THEN** task 1's done marker holds the current hashes with `recertification_count: 1`, one `recertification` event carries `outcome: passed` and `automatic: true`, no `.run/regressed/1.md` exists, and task 3 runs

#### Scenario: Verify fails at detection
- **WHEN** the chain is intact but task 1's verify fails
- **THEN** task 1 gets a regression marker and a `regressed` event, and the change halts

#### Scenario: Human edit breaks the chain
- **WHEN** `src/a.ts` was edited by hand between task 1's done marker and task 2's start
- **THEN** task 2's first `before` doesn't match task 1's recorded hash, so task 1 gets a regression marker and the change halts

#### Scenario: File outside every later scope
- **WHEN** a changed file of task 1 is covered by no later task's scope
- **THEN** task 1 gets a regression marker and the change halts

#### Scenario: Resolver upgrade only
- **WHEN** a done marker lacks the current resolver version but no file differs
- **THEN** it is recorded as a scope regression exactly as before

### Requirement: Governing decisions in the manifest
<!-- source: src/core/run/manifest.ts, tests/instructions-drift.test.ts -->
The approval manifest SHALL carry `decisions`, an object from the number of
each accepted ADR that governs the change to the `sha256:<hex>` hash of its
file content. An approval with no governing ADR SHALL record an empty object.
A planning-only manifest SHALL omit the field.

#### Scenario: Governing ADR recorded
- **WHEN** accepted ADR 009 applies to a capability the change writes and the change is approved
- **THEN** the manifest's `decisions` maps `009` to the hash of ADR 009's file

### Requirement: Instructions changed after approval
<!-- source: src/watcher/instructions-drift.ts, src/watcher/spawn.ts, src/harness/types.ts, tests/instructions-drift.test.ts -->
Before a task's first attempt spawns, the watcher SHALL compare the current
AGENTS.md hash with the manifest's `hashes["AGENTS.md"]` and, when the manifest
has `decisions`, the current governing ADR set and hashes with it. When either
differs, it SHALL append one `instructions_changed` event to the task stream
with `data.changed`, a list holding `AGENTS.md` when that file changed and
`ADR <number> added`, `ADR <number> changed`, or `ADR <number> removed` for
each ADR difference in number order, and print one warning line
`task <n>: instructions changed after approval: <changed joined by ", ">`. The
task SHALL still run. The check SHALL do nothing for a later attempt, for a
manifest without `approvedAt`, or when the task stream already holds an
`instructions_changed` event.

#### Scenario: AGENTS.md edited after approval
- **WHEN** AGENTS.md changes between approval and task 1's first attempt
- **THEN** task 1's stream gains one `instructions_changed` event with `changed: ["AGENTS.md"]`, one warning line prints, and the agent still spawns

#### Scenario: New ADR accepted after approval
- **WHEN** an accepted ADR for a capability the change writes is added after approval
- **THEN** the event's `changed` holds `ADR <number> added` and the task still runs

#### Scenario: Nothing changed
- **WHEN** AGENTS.md and the governing ADRs match the approval
- **THEN** no `instructions_changed` event is appended and no warning prints

### Requirement: Dependency baseline
<!-- source: src/watcher/dependencies.ts, src/watcher/measures.ts, src/harness/types.ts, tests/denied-dependency.test.ts -->
When a task's resolved scope includes a path whose file name is
`package.json`, the `measures` start event of every attempt SHALL carry
`dependencies`, an object from each such repository-relative path to the
sorted distinct package names in its `dependencies`, `devDependencies`,
`peerDependencies`, and `optionalDependencies`, empty for a missing or
unreadable file. Without such a path the field SHALL be absent. The watcher
SHALL never read a `package.json` outside the task's resolved scope for this.

#### Scenario: Scoped manifest
- **WHEN** a task's scope includes `package.json`, which depends on `chokidar` and dev-depends on `tsx`
- **THEN** its `measures` start event carries `dependencies: { "package.json": ["chokidar", "tsx"] }`

#### Scenario: Manifest outside scope
- **WHEN** a task's scope doesn't include `package.json`
- **THEN** its `measures` start event has no `dependencies` field and the file is not read

### Requirement: Dependencies added
<!-- source: src/watcher/dependencies.ts, src/watcher/task-verify.ts, src/harness/types.ts, tests/denied-dependency.test.ts -->
After the agent exits, after the blocked check and before the missing verify
path check, the watcher SHALL compare each path in the latest `measures` start
event's `dependencies` with the same file's current package names across the
four sections. When any name is new, it SHALL append one `dependencies_added`
event with `data.added`, the `{ file, name }` pairs sorted by file and then
name. A name moved between sections SHALL NOT count, and without a baseline
the comparison SHALL be skipped.

#### Scenario: Allowed addition
- **WHEN** the agent adds `zod` to a scoped `package.json` and no accepted ADR denies it
- **THEN** one `dependencies_added` event names `zod` and the file, and the task goes on to its verify

### Requirement: Denied dependency
<!-- source: src/watcher/dependencies.ts, src/watcher/task-verify.ts, src/watcher/failure-reason.ts, tests/denied-dependency.test.ts -->
When an added name is listed in `denies` of an accepted ADR, the task SHALL
die with reason `denied_dependency` after the `dependencies_added` event is
appended, and SHALL run neither verify. The dead marker body SHALL start
`The task added packages an accepted ADR denies:` and hold one line per denied
pair and ADR, `- <name> in <file>: ADR <number>: <rule>`. Packages denied only
by proposed or superseded ADRs SHALL NOT be enforced.

#### Scenario: Vue denied
- **WHEN** accepted ADR 007 denies `vue` and the agent adds `vue` to a scoped `package.json`
- **THEN** the task dies with `denied_dependency`, and the marker names `vue`, the file, ADR 007, and its rule

#### Scenario: Superseded denial
- **WHEN** only a superseded ADR denies `vue` and the agent adds it
- **THEN** the task doesn't die for it
