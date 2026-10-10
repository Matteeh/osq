# watcher-and-harness Specification

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## Requirements

### Requirement: Exclusive locking and stale lock reaping
The system SHALL manage atomic task locks and reap stale locks.

#### Scenario: Atomic lock acquisition
- **WHEN** runner initiates task `<n>`
- **THEN** system acquires `.run/running/<n>.pid` atomically and rejects execution if lock already exists

#### Scenario: Stale lock reaping
- **WHEN** active lock has terminated PID or age exceeds `staleLockSeconds`
- **THEN** watcher reaps the lock to `.run/dead/<n>.md` with reason `crashed` or `timeout`

### Requirement: Zero-trust verification gate and write-only checkbox projection
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
The system SHALL decouple agent execution via `HarnessAdapter` implementations.

#### Scenario: Adapter process spawning
- **WHEN** watcher executes a task
- **THEN** configured adapter spawns agent process, enforces execution timeouts, and routes event stream to normalized harness events

#### Scenario: Kill-grace timeout coverage
- **WHEN** the process timeout test runs a real child that handles `SIGTERM` without terminating
- **THEN** the test asserts that execution timed out and terminated with `SIGKILL`, without asserting wall-clock time

### Requirement: Authoritative lifecycle events and result synthesis
The system SHALL maintain authoritative lifecycle events and synthesize missing result files.

#### Scenario: Result file synthesis
- **WHEN** agent process exits successfully without authoring `.run/results/<n>.md`
- **THEN** runner extracts final text event and writes synthesized result file with `synthesized: true` frontmatter

### Requirement: Live terminal status row and curated logging
The system SHALL maintain an interactive status row and emit curated permanent log lines.

#### Scenario: Task outcome line logging
- **WHEN** task completes or dies
- **THEN** logger emits exactly one outcome line via `formatTaskOutcomeLine` at info level

### Requirement: Deterministic delta specification application
The system SHALL apply delta specifications into base capability specs upon change archival.

#### Scenario: Merging deltas into base specs
- **WHEN** all tasks in an approved spec are done
- **THEN** system applies `RENAMED`, `REMOVED`, `MODIFIED`, and `ADDED` blocks into `openspec/specs/<capability>/spec.md` deterministically and moves folder to archive

### Requirement: Reactive watcher loop and signal handling
The system SHALL watch specifications reactively and respond cleanly to termination signals. When `startWatcher` is given an abort signal and the signal fires, it SHALL start no cycle, file watcher or poll interval after the abort, and the promise it returns SHALL resolve once no cycle is running.

#### Scenario: SIGINT interruption handling
- **WHEN** SIGINT is received during task execution
- **THEN** watcher clears status line, restores cursor, awaits active task exit, and terminates immediately on second SIGINT

#### Scenario: Abort during setup
- **WHEN** a watcher's abort signal fires after its first cycle and before its file watcher and poll interval exist
- **THEN** neither is created, no further cycle runs, and `startWatcher`'s promise resolves

#### Scenario: Abort during a cycle
- **WHEN** a watcher's abort signal fires while a cycle is running
- **THEN** `startWatcher`'s promise resolves only after that cycle has finished, and no cycle starts after it

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/run/**, src/core/lifecycle/**, tests/retry*.test.ts, tests/reject.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, deterministic task-scope resolution and hashing, shared
verification execution, agent harnesses, adapter registration, execution
manifest construction, and append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, scope, verification, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/run/**`, `src/core/lifecycle/**`, `tests/retry*.test.ts`, and `tests/reject.test.ts` to watcher-and-harness

### Requirement: Capability rule prompt injection
The harness runner SHALL extract rules from capability specifications written
by the active change and inject them into the executor prompt. It SHALL leave
out a delta requirement whose statement, with HTML comments stripped and
whitespace collapsed, equals the statement of the living requirement with the
same name. Every requirement of a capability with no living spec SHALL keep
its rule.

#### Scenario: Prompt injection on change with capability writes
- **WHEN** an approved change writes capability deltas under `specs/<capability>/spec.md`
- **THEN** runner extracts capability requirements and injects them under a dedicated section within the prompt's `Rules:` block

#### Scenario: Fallback when no capability rules exist
- **WHEN** an approved change has no capability delta rules
- **THEN** runner provides standard operational rules without empty rule headers

#### Scenario: Unchanged requirement left out
- **WHEN** a delta modifies requirement `Totals` without changing its statement, and adds requirement `Refunds`
- **THEN** the executor prompt carries a rule for `Refunds` and none for `Totals`

### Requirement: Test modification gating
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
The watcher SHALL verify that compiled output is not older than source files
when started from a checkout, and again before each spawn and each archive.
The check SHALL skip a package root without `src/` and a run from TypeScript
source, and SHALL not run at all when `allowStale` or `dev` is set. A check
during a run SHALL compare the newest file mtime under `src/` with the newest
under `dist/` as read when the watcher started, because the running code is
what it loaded then. `findStaleBuild` in `src/watcher/build.ts` SHALL return
the stale line, `osq build is stale: src/ is newer than dist/ in <package
root>. Run 'npm run build' there or pass --allow-stale.`, where `<package
root>` is the absolute package root it compared, or null, without printing or
exiting. `staleBuildMessage(packageRoot)` in the same file SHALL build that
line, and `StaleBuildError` SHALL carry the line it was given as its message.
`checkStaleBuild` SHALL print that line and exit 1 when `findStaleBuild`
returns it. The start check in `startWatcher` SHALL print the line and exit 1
the same way. The pass check SHALL run at the top of the step that picks up a
pending task, before the sync, the scope audit, and the spawn, and at the top
of the archive step, before the worktree checks. When it finds the build
stale, the watcher SHALL write no marker, commit, or event for any change,
SHALL NOT log a `watcher error`, SHALL stop the loop, print the stale line to
stderr, and exit 1, in continuous and in `once` mode. A watcher started with
a `buildCheck`, as a service worker is, follows "Service worker build checks"
instead and never exits on a stale build.

#### Scenario: Stale build detected on checkout without allow-stale
- **WHEN** watcher starts from a checkout and newest file mtime under `src/` exceeds newest mtime under `dist/` without `--allow-stale`
- **THEN** watcher logs a single error line to stderr and exits non-zero

#### Scenario: Stale build bypassed with allow-stale
- **WHEN** watcher starts from a checkout with stale `dist/` and `--allow-stale` is supplied
- **THEN** watcher continues startup into the execution loop

#### Scenario: Source edited while a task runs
- **WHEN** a watcher starts with a fresh build, and the adapter's spawn for task 1 of a one-task change writes a file under `src/` newer than `dist/`
- **THEN** `.run/done/1` exists, the change is not archived, stderr holds the stale line, the exit code is 1, and no `watcher error` is logged

#### Scenario: Stale before the first spawn
- **WHEN** `runWatcherCycle` runs with a stale check that returns the stale line, for a change whose task 1 is pending
- **THEN** it rejects with `StaleBuildError`, the adapter's spawn is never called, and `.run/` gains no file

#### Scenario: Rebuilt without restart
- **WHEN** `src/` gets a newer file during a run, and `dist/` gets a newer file after that, before the next pass
- **THEN** the next pass still finds the build stale, because it compares with `dist/` as read at start

#### Scenario: Allow stale during a run
- **WHEN** a watcher started with `allowStale`, and `src/` gets a newer file while task 1 runs
- **THEN** the change archives and the watcher does not exit

#### Scenario: Stale line names the package root
- **WHEN** `findStaleBuild` runs with a relative package root whose `src/` is newer than its `dist/`
- **THEN** it returns the stale line with that root resolved to an absolute path in place of `<package root>`

#### Scenario: Error carries the found line
- **WHEN** `runWatcherCycle` runs with a stale check that returns a line naming some package root
- **THEN** it rejects with a `StaleBuildError` whose message is exactly that line

### Requirement: Reactive dev mode execution
The watcher in dev mode SHALL execute from source via tsx and restart the watch loop on source file changes.

#### Scenario: Dev mode execution through tsx
- **WHEN** watcher starts with `--dev`
- **THEN** execution runs through `tsx` directly from `src/`

#### Scenario: Source file modification during task execution
- **WHEN** a file under `src/` changes while a task is running in dev mode
- **THEN** watcher finishes the active task verification and outcome recording before restarting the loop

### Requirement: Runner lifecycle modularization
The watcher runner SHALL partition lifecycle phases into discrete modules under 200 lines each (`lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, `outcome.ts`), with `runner.ts` orchestrating the sequence.

#### Scenario: Module line budget limit
- **WHEN** line counts are evaluated for `lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, `outcome.ts`, and `runner.ts`
- **THEN** each file contains fewer than 200 lines of code

#### Scenario: Lifecycle sequence orchestration
- **WHEN** `runTask` executes
- **THEN** runner coordinates lock acquisition, heartbeat observation, agent process execution, test gating, verification, and outcome recording across dedicated lifecycle modules

### Requirement: Architectural import graph boundaries
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
The engine SHALL centralize marker file emission in dedicated watcher outcome helpers, isolate lock reaping to detection, and evaluate change status purely against in-memory filesystem snapshots.

#### Scenario: Marker and event invariant parity
- **WHEN** a task terminates under any `RunTaskFailureReason` or reaches successful completion
- **THEN** matching marker content and lifecycle events are written through centralized outcome helpers

#### Scenario: Pure spec state derivation
- **WHEN** spec state is computed
- **THEN** `deriveSpecState` evaluates an in-memory change folder snapshot without performing direct asynchronous disk I/O

### Requirement: Source module line budget enforcement
The test suite SHALL enforce a 250-line maximum on all source files under
`src/`, counted as the number of `\n`-separated lines. A file SHALL be exempt
only when its path relative to `src/` is on the allow list in
`tests/line-budget.test.ts`; a file of the same name elsewhere SHALL NOT be.
A listed path that no longer exists, or whose file is within the budget, SHALL
fail the test, so the list only shrinks.

#### Scenario: Source file size within budget
- **WHEN** files under `src/` are inspected
- **THEN** every file whose path relative to `src/` is not on the allow list contains 250 or fewer lines

#### Scenario: Same name in another folder
- **WHEN** `harness/types.ts` is listed and an unlisted `core/foo/types.ts` has more than 250 lines
- **THEN** the test fails naming `src/core/foo/types.ts` and its line count

#### Scenario: Listed file within the budget
- **WHEN** a listed path's file has 250 or fewer lines
- **THEN** the test fails naming that path and saying it should leave the allow list

#### Scenario: Listed file missing
- **WHEN** a listed path does not exist under `src/`
- **THEN** the test fails naming that path and saying it no longer exists

### Requirement: Backward-compatible state derivation and watcher layout cut-over
The state derivation subsystem SHALL support overloaded invocation for both in-memory snapshots and direct project paths, while the watcher archiver resolves destination paths through canonical layout helpers.

#### Scenario: Asynchronous disk-backed state derivation
- **WHEN** callers invoke `deriveSpecState(projectRoot, folderPath)`
- **THEN** function reads change folder snapshot from disk asynchronously and returns the derived `SpecState`

#### Scenario: Archiver uses canonical layout
- **WHEN** watcher completes and archives a change
- **THEN** archive destination path is determined using `getArchiveDir` from `src/core/layout.ts`

### Requirement: Run manifest at approval
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
The task, incremental change, scope-audit, and archive verification gates SHALL
execute commands through one core process implementation that returns command,
exit code, duration, output, and timeout state. Watcher callers SHALL emit
`verify_ran` events through the single watcher verification entrypoint, which
writes the run's log and records its tail as "Verify output logs" says. Core
verification SHALL NOT import watcher or harness modules.

#### Scenario: Verified task event fields
- **WHEN** task verification succeeds
- **THEN** runner emits a `verify_ran` event containing `command`, `exitCode: 0`, wall-clock `duration`, the `log` path, and the output's tail when it is not blank

#### Scenario: Failed task event fields
- **WHEN** task verification exits with non-zero code or times out
- **THEN** runner emits a `verify_ran` event containing `command`, non-zero `exitCode`, elapsed `duration`, the `log` path, the output's tail, and timeout state

#### Scenario: Incremental change verification attribution
- **WHEN** runner executes the proposal verify after a passing task verify
- **THEN** the same watcher verification entrypoint appends its `verify_ran` event to the established change-level target

#### Scenario: Single verification event emission path
- **WHEN** watcher verification or explicit scope recertification executes a verify command
- **THEN** both use the same timeout-bounded core process implementation without violating core import isolation

### Requirement: Done marker scope hash frontmatter
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
Before archiving, the watcher SHALL re-run every task verification against the
final tree after scope recertification. It SHALL then apply the change's
deltas and sidecars to the living specs and re-run the change-level
verification against that tree, so the tree it archives is a verified tree.
Before applying, it SHALL write `.run/archive-specs.json`, recording for each
capability folder under the change's `specs/` the content of the living
`spec.md` and `osq.yml`, or that the file is absent. When the change-level
verification fails or names a missing path, it SHALL put each recorded file
back as it was, removing one that was absent and a capability folder left
empty, delete the record, and leave the change unarchived with the established
change regression in `.run/regressed/change.md`. When the record exists as an
archive attempt begins, because the watcher stopped after applying, it SHALL
first put the files back the same way; the watcher's archive step SHALL do
this before it checks the change's worktree. A command naming a missing path
SHALL NOT run; its regression SHALL carry reason `verify_path_missing` and the
paths as `missingPaths`. When all gates pass, it SHALL delete the record and
root-level `plan-prompt.md`, relocate the folder, project completed
checkboxes, and record the archive event. The transient prompt and the record
SHALL not affect any archive tree hash. `archiveSpecFolder` SHALL keep applying
the deltas and sidecars itself for callers that archive without these gates.

#### Scenario: Archive verification passes and seals change
- **WHEN** every task verification passes against the final tree and the change-level verify command passes against it with the deltas applied
- **THEN** the archiver removes the transient prompt and relocates the change to the archive, and the living specs hold the deltas

#### Scenario: Task verification regression blocks archive
- **WHEN** any task verification command fails during archive preflight
- **THEN** the watcher records the established task regression, applies no delta, and leaves the change and prompt unarchived

#### Scenario: Change-level verification regression blocks archive
- **WHEN** the change-level verify command fails against the tree with the deltas applied
- **THEN** the watcher records the established change regression, the living specs are what they were before archive began, and the change and prompt stay unarchived

#### Scenario: Archive succeeds with a prompt file
- **WHEN** every final-tree verification passes and `plan-prompt.md` exists
- **THEN** the archived change omits the prompt and `.run/archive-specs.json` while retaining authored artifacts and runtime records

#### Scenario: Archive verification fails
- **WHEN** a task or change-level final verification fails
- **THEN** the active change and its prompt remain available for diagnosis and no archive event is written

#### Scenario: Named path missing at archive
- **WHEN** a done task's verify names a file that no longer exists
- **THEN** that task gets a regressed marker with reason `verify_path_missing` listing the path, its `regressed` event carries `missingPaths` with the path and no `differingPaths`, the command does not run, and the change stays unarchived

#### Scenario: Change verify sees the merged specs
- **WHEN** the change-level verify exits 0 only when the living spec holds the requirement the change's delta adds
- **THEN** the change archives

#### Scenario: Red change verify puts the specs back
- **WHEN** a change modifies one requirement of `orders`, removes another, carries a replacement `osq.yml` for it, creates `billing` with a group, and its change-level verify exits 1
- **THEN** `orders`'s `spec.md` and `osq.yml` are byte for byte what they were, `openspec/specs/billing` does not exist, `.run/archive-specs.json` is gone, and `.run/regressed/change.md` has reason `verify_red`

#### Scenario: Interrupted archive
- **WHEN** `.run/archive-specs.json` exists and the living specs already hold the change's deltas, as after the watcher stopped during the change-level verify
- **THEN** the next archive attempt puts the recorded files back, applies the deltas once, and archives with the removed requirement absent

#### Scenario: Interrupted archive in a worktree
- **WHEN** a change runs in an osq worktree and the worktree holds `.run/archive-specs.json` and living specs modified by an interrupted archive
- **THEN** the next watcher cycle archives the change instead of halting it with `worktree_dirty`

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

### Requirement: Marker retention under run directory
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
The harness event stream SHALL keep the typed `done_manual` event, with
payload `task` and `reason`, so task streams that older osq versions wrote
when a human marked a task done still parse. osq SHALL NOT append a
`done_manual` event.

#### Scenario: Typed done_manual event emission
- **WHEN** an archived task stream holds a `done_manual` event with `task` and `reason`
- **THEN** it parses as a typed `done_manual` event, and no osq command appends one

### Requirement: Interactive harness adapter spawning
Harness adapters SHALL implement `spawnInteractive` inheriting terminal stdio and returning the process exit code.

#### Scenario: Opencode interactive session spawning
- **WHEN** `OpencodeAdapter.spawnInteractive` executes
- **THEN** adapter executes `opencode mini --prompt <prompt>` in the working directory with inherited stdio, adding `--model` and `--agent` when given, and no variant, which `mini` does not accept

#### Scenario: Agy interactive session spawning
- **WHEN** `AgyAdapter.spawnInteractive` executes
- **THEN** adapter executes binary with inherited stdio, passing prompt via `-i`, and optional model and agent flags

### Requirement: Codex task execution
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
Execution manifests and started events SHALL record the selected Codex model without another harness's fallback. Native model selection SHALL be represented as default rather than a guessed model. The manifest SHALL record configured Codex effort or null while preserving explicit planner.model-or-null semantics.

#### Scenario: Explicit settings
- **WHEN** Codex execution has a selected model and effort
- **THEN** process arguments, started metadata, and execution manifest agree on the model and the manifest records that effort

#### Scenario: Native model
- **WHEN** no Codex model override applies
- **THEN** the CLI model flag is omitted and execution metadata records default without an agy or OpenCode model

### Requirement: Codex interactive sessions
The adapter SHALL implement the existing spawnInteractive port using Codex's interactive CLI with inherited stdio, project cwd, the supplied opening prompt, optional selected model, workspace-write sandboxing, and on-request approvals. It SHALL use native planner effort defaults and reject unsupported agent arguments.

#### Scenario: Interactive launch
- **WHEN** osq plan invokes the registered Codex adapter
- **THEN** the interactive process receives the existing ordered prompt without exec/JSON flags or executor effort overrides

#### Scenario: Interactive termination
- **WHEN** the interactive process exits nonzero, is terminated by a signal, or cannot spawn
- **THEN** the adapter returns a nonzero outcome that the planning command propagates

### Requirement: Exhaustive adapter registration and generic preflight
The harness subsystem SHALL provide one adapter factory for every canonical catalog entry and no unlisted factory. Watcher startup SHALL invoke the selected adapter's optional preflight port before task execution without testing the adapter's name, and SHALL continue normally when the port is absent.

#### Scenario: Adapter with preflight
- **WHEN** watcher startup receives any registered adapter implementing preflight
- **THEN** it invokes preflight before the first execution cycle and propagates failure without spawning a task

#### Scenario: Adapter without preflight
- **WHEN** watcher startup receives a registered adapter without preflight
- **THEN** it enters the execution cycle without a harness-specific fallback

### Requirement: Shared selected-harness attribution
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
A successful rejection SHALL write `.run/rejected.md` in the moved folder and
append one typed `rejected` event to `.run/events/change.jsonl`. Both artifacts
SHALL record the same non-empty reason and ISO timestamp while all pre-existing
events and run artifacts remain intact.

#### Scenario: Rejection is recorded after relocation
- **WHEN** an eligible change moves to the rejected directory
- **THEN** its destination contains a matching rejection marker and change-level event after all previous event bytes

### Requirement: Scope recertification audit
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
The lifecycle event union SHALL include a typed `recertification` event carrying
task, outcome, differing paths and attribution, verify command, exit code,
the output's tail from "Event output tail" and timeout state, recorded or
original scope hash, and current scope hash. Outcome SHALL be `passed` when
human retry or automatic scope recertification refreshes the trusted done
record and `requeued` when failed verification returns the task to agent
work. An automatic recertification's event SHALL carry `automatic: true`; a
human one SHALL carry no `automatic` key.

A passed recertification SHALL not advance execution attempts. A requeued
recertification SHALL retain the next execution attempt and failed verification
context in append-only state so a restarted watcher supplies them to the next
executor.

#### Scenario: Human recertification passes
- **WHEN** explicit retry verification exits zero for a scope-regressed task
- **THEN** one `recertification` event records `outcome: passed` without a retry, started event, or execution-attempt increment

#### Scenario: Human recertification requeues
- **WHEN** explicit retry verification exits non-zero or times out
- **THEN** one `recertification` event records `outcome: requeued` and preserves the next attempt and the tail of the failing output for a later agent spawn

#### Scenario: Automatic recertification event
- **WHEN** the watcher recertifies a task automatically
- **THEN** one `recertification` event records `outcome: passed` and `automatic: true` without a retry, started event, or execution-attempt increment

### Requirement: Deterministic task scope resolution
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
Every textual harness SHALL deliver the prompt `buildExecutorPrompt` returns,
byte for byte, and SHALL keep its own delivery, arguments, and attachments. The
prompt SHALL name the task file, `proposal.md`, title, scope, entry files,
verification command, result destination, prior context, delta spec paths, and
living spec paths, then the managed executor steps, capability rules, managed
exit text, and the concrete result path. Its closing line SHALL also tell the
agent never to run git. It SHALL NOT name `features/` or a parent `spec.md`.
When `SpawnTaskOptions.prompt` is set, `buildExecutorPrompt` SHALL return it
unchanged instead, so a role other than the executor uses the same harness
delivery without a new adapter method.

#### Scenario: Same task, three harnesses
- **WHEN** agy, codex, and opencode build argv for the same fixture task
- **THEN** each carries the same prompt text, equal to its checked-in golden prompt

#### Scenario: Specs named for every harness
- **WHEN** a change writes a delta spec and its proposal reads a living capability that exists
- **THEN** every harness prompt lists the delta spec path under `Delta Specs:` and the living spec path under `Living Capability Specs:`

#### Scenario: Managed text reaches the prompt
- **WHEN** a harness prompt is built
- **THEN** it contains every managed executor step line and every managed exit line verbatim

#### Scenario: No git
- **WHEN** a harness prompt is built
- **THEN** its last line says never to run git

#### Scenario: Prompt override
- **WHEN** `SpawnTaskOptions.prompt` is `judge this` and the claude and pi adapters build argv
- **THEN** `buildExecutorPrompt` returns `judge this`, and each argv's last argument is `judge this`

### Requirement: Pi task execution
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
Each Pi `auto_retry_start` and `auto_retry_end` SHALL become a `harness_retry`
event carrying `phase` (`start` or `end`) and `attempt`, plus `maxAttempts`,
`delayMs`, `success`, and `error` when Pi reports them.

#### Scenario: One retry
- **WHEN** a run contains one `auto_retry_start` and one `auto_retry_end`
- **THEN** two `harness_retry` events are written, with phases `start` and `end`

### Requirement: Pi failure and result handling
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
Each cycle, for every dead task in an approved change, the watcher SHALL retry
the task through `retrySpec` with `automatic: true` when its dead reason is
eligible, it is not stuck, and it has fewer automatic retries than
`gates.autoRetries` since the later of the manifest's `approvedAt` and its last
manual retry. Eligible reasons SHALL be `verify_red`, `change_verify_red`,
`undeclared_test_change`, `verify_path_missing`, `denied_dependency`,
`vcs_violation`, `scope_violation`, `no_result`, `crashed`, and `timeout`.

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

#### Scenario: Scope violation is retried
- **WHEN** a task in a worktree dies with `scope_violation`
- **THEN** it is retried automatically once and the next attempt's prompt contains the violating file

### Requirement: Dead marker fingerprint
Every dead marker's frontmatter SHALL record `fingerprint: sha256:<hex>`,
hashed over the reason and the marker body after stripping ANSI codes and
replacing ISO timestamps, durations including a number after a duration key,
PIDs, absolute paths under the project root, paths under the temp directory,
and the run number of a verify log path with fixed placeholders. A temp path,
matched by `os.tmpdir()` and its real path, keeps what follows its first
segment: `/tmp/x-Hf38F/a.db` becomes `<tmp>/a.db`. A verify log path keeps its
target: `.run/logs/1-2.log` becomes `.run/logs/1-<n>.log`.

#### Scenario: Volatile details
- **WHEN** two markers with the same reason differ only in timestamps, durations, PIDs, ANSI codes, temp directory names, or the project root path
- **THEN** their fingerprints are equal

#### Scenario: Repeated node:test failure
- **WHEN** the same failing `node:test` file, creating and printing a `mkdtemp` directory, runs twice and each output becomes a dead marker
- **THEN** the two markers have the same fingerprint

#### Scenario: Different failures
- **WHEN** two markers differ in reason, in a failing test name, or in an assertion message
- **THEN** their fingerprints differ

#### Scenario: Verify log run number
- **WHEN** two task 1 dead markers differ only in `Full output: .run/logs/1-1.log` and `Full output: .run/logs/1-2.log`
- **THEN** their fingerprints are equal, and a marker naming `.run/logs/2-1.log` instead has a different fingerprint

### Requirement: Stuck task detection
When automatic retry is enabled and a dead task's fingerprint equals the
fingerprint of its most recent retained dead marker, the watcher SHALL NOT retry
it automatically. It SHALL add `stuck: true` to the active marker, append one
`stuck` event with the task and fingerprint, and print one line, each once per
death. `osq retry` SHALL still retry a stuck task. A task whose active dead
reason is `provider_unavailable` SHALL never be marked stuck.

#### Scenario: Same failure twice
- **WHEN** a task dies twice with identical output
- **THEN** the second marker is stuck, one `stuck` event is appended, and no third attempt starts

#### Scenario: Same provider outage twice
- **WHEN** a task dies twice with `provider_unavailable` and the same provider error
- **THEN** no marker is stuck and no `stuck` event is appended

### Requirement: Verify path check
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
Every Claude task SHALL run with `--permission-mode dontAsk`, the allow rules
`Bash`, `Read`, `Edit(./**)`, `Write(./**)`, `Glob`, and `Grep`, and the deny
rules `Bash(git:*)`, `Bash(curl:*)`, `Bash(wget:*)`, `Bash(ssh:*)`,
`Bash(scp:*)`, and `Bash(sudo:*)`, in that order, after `--disallowedTools`.
When `claude.sandbox` is true, the `--settings` JSON SHALL also carry
`sandbox` with `enabled: true`, `failIfUnavailable: true`,
`autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, and
`network` with an empty `allowedDomains` and `strictAllowlist: true`.

#### Scenario: Default containment
- **WHEN** `claude.sandbox` is unset or false
- **THEN** the settings JSON is exactly `{"autoMemoryEnabled":false}` and the `git` deny rule is passed

#### Scenario: Sandboxed containment
- **WHEN** `claude.sandbox` is true
- **THEN** the settings JSON carries the sandbox block above, and the `git` deny rule is still passed

#### Scenario: Network tools and sudo denied
- **WHEN** `buildClaudeArgs` runs with any configuration
- **THEN** the arguments after `--disallowedTools` are `Bash(git:*)`, `Bash(curl:*)`, `Bash(wget:*)`, `Bash(ssh:*)`, `Bash(scp:*)`, and `Bash(sudo:*)`, followed by `--strict-mcp-config`

### Requirement: Claude stream translation
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

### Requirement: Import fan-in from the shared graph
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
After the agent exits and the runner has made sure a result file exists, a
result file whose `## Blocked` section `parseResultSections` reads as present
SHALL make the task die with reason `blocked`. The runner SHALL check this
before the missing verify path check, the task verify, and the change verify,
and SHALL run none of them for a blocked task. The dead marker SHALL carry
`reason: blocked` in its frontmatter and the stated need in its body, and one
`dead` event SHALL record reason `blocked`. A `## Blocked` section that is empty
or says only `None`, as "Result file sections" defines it, SHALL leave the task
to the checks that follow, as before. `blocked` SHALL NOT be one of the reasons
eligible for an automatic retry.

#### Scenario: Executor stops blocked
- **WHEN** a fake agent writes a result file whose `## Blocked` says `Needs src/b.ts in scope` and writes no code
- **THEN** the task dies with `blocked`, the dead marker body holds `Needs src/b.ts in scope`, and no `verify_ran` event follows the agent's exit

#### Scenario: Blocked task is not retried
- **WHEN** a watcher cycle with `gates.autoRetries` of 1 sees a task that died with `blocked`
- **THEN** the task stays dead and no `retry` event is appended

#### Scenario: Blocked says None
- **WHEN** the result file's `## Blocked` says only `None`
- **THEN** the task goes through the missing-path check and verify as before

#### Scenario: Blocked says None as a bullet
- **WHEN** a fake agent's result file says `- None.` under `## Blocked` and the task's verify passes
- **THEN** a `verify_ran` event follows, the task is done, and the change archives

### Requirement: Automatic scope recertification
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
The approval manifest SHALL carry `decisions`, an object from the number of
each accepted ADR that governs the change to the `sha256:<hex>` hash of its
file content. An approval with no governing ADR SHALL record an empty object.
A planning-only manifest SHALL omit the field.

#### Scenario: Governing ADR recorded
- **WHEN** accepted ADR 009 applies to a capability the change writes and the change is approved
- **THEN** the manifest's `decisions` maps `009` to the hash of ADR 009's file

### Requirement: Instructions changed after approval
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

### Requirement: Change folder in verify environment
`runVerificationCommand` SHALL take the change folder as a required argument,
either an absolute path or null. It SHALL run the command with its role's
environment from "Role environments", the verify role unless the caller names
prepare, plus `OSQ_CHANGE` set to that path. With null, it SHALL run with
`OSQ_CHANGE` removed, even when osq's own environment has it. Every watcher
verify SHALL pass the change folder it runs for: a task's pre-spawn and
post-exit verify, the change-level verify, the archive-time verifies and
check, and the scope-regression audit. So SHALL the recertification verify of
`osq retry`. A land's sync SHALL run an archived change's verify and `check`
with null, because its deltas are already in the living spec.

#### Scenario: Task verify sees its change
- **WHEN** the watcher runs a task whose verify prints `OSQ_CHANGE`
- **THEN** the recorded `verify_ran` output is the absolute path of the change folder

#### Scenario: Archived check runs without it
- **WHEN** a land's sync runs an archived change's `check` command while osq's environment has `OSQ_CHANGE` set
- **THEN** the command sees no `OSQ_CHANGE`

### Requirement: Focused file collection
When `traceability.focusedTests` is set, osq SHALL collect a task's focused
scenarios and files from the scenario index, built once for the collection.
The collected scenarios are the capability and name pairs named by `scenario(...)`
calls for an opted-in capability, in scenario test files in the task's resolved
scope. The focused files are every scenario test file in the repository that
names a collected scenario, as sorted, distinct, project-relative paths. With
the command unset, no capability opted in, or no collected scenario, there is
nothing to run.

#### Scenario: Two scenarios, one outside file
- **WHEN** the task's scoped `tests/pricing-quote.test.ts` names two pricing scenarios and the unscoped `tests/pricing-bulk.test.ts` names one of them
- **THEN** the focused files are `tests/pricing-bulk.test.ts` and `tests/pricing-quote.test.ts`

#### Scenario: Capability not opted in
- **WHEN** the task's scoped test names only scenarios of a capability that isn't opted in
- **THEN** there is nothing to run

### Requirement: Focused run
osq SHALL run the focused command with `{files}` replaced by the focused files,
each single-quoted for the shell and separated by spaces. It SHALL run through
`runVerificationCommand` with the task's change folder and the verify timeout,
so it gets the verify's environment, `OSQ_CHANGE` included. The outcome SHALL be:

- `failed` when the output has a line matching `not ok <n> - <title>`, at any
  indentation, whose title, with a trailing ` # <directive>` removed and `\#`
  and `\\` unescaped, is `Scenario: <name>` for a collected scenario's name
- `problem` when the exit code isn't 0, or the run timed out or couldn't start,
  and it isn't `failed`
- `passed` otherwise

#### Scenario: Failing scenario test
- **WHEN** the output holds `not ok 3 - Scenario: Volume discount tiers` and that scenario was collected
- **THEN** the outcome is `failed`

#### Scenario: Failure outside the scenarios
- **WHEN** the command exits 1 and its only `not ok` line names a file that failed to load
- **THEN** the outcome is `problem`

### Requirement: Focused failure ends the attempt
After the agent exits, the watcher SHALL run the focused run as the last check
of `checkBlockedFirst`, after the missing verify path check, and only when there
is something to run. It SHALL append one `focused_ran` event with `command`,
`files`, `scenarios` as `<capability>: <name>` strings, `outcome`, `exitCode`,
`duration`, `timedOut`, and `output`.

On `failed`, the watcher SHALL kill the task with `verify_red` and not run its
verify. The dead marker's frontmatter holds `reason: verify_red`, `focused: true`,
and the quoted focused command. Its body is
`Watcher focused scenario tests failed:` followed by the output, so the next
attempt receives it as it receives verify output. On `problem` or `passed`, the
watcher SHALL run the verify as before, which alone decides the outcome.

#### Scenario: Focused pass goes on to verify
- **WHEN** the focused run passes
- **THEN** a `focused_ran` event with outcome `passed` is followed by the task's `verify_ran` event

#### Scenario: Broken focused command
- **WHEN** the focused command is `node missing-runner.js {files}`
- **THEN** a `focused_ran` event with outcome `problem` is recorded and the verify still decides the task

#### Scenario: Unset command
- **WHEN** `traceability.focusedTests` is unset
- **THEN** no `focused_ran` event is appended and the task runs exactly as before

### Requirement: Mutation command
osq SHALL run the mutation command once per pick, through
`runVerificationCommand` with the change folder, so the command also gets
`OSQ_CHANGE`. It SHALL set:

- `{mutate}` and `OSQ_MUTATE`: the pick's ranges, comma-joined for the
  placeholder and as a JSON array for the variable
- `{tests}` and `OSQ_MUTATION_TESTS`: the pick's tests, single-quoted for the
  shell and space-separated for the placeholder, and as a JSON array for the
  variable
- `{report}` and `OSQ_MUTATION_REPORT`: an absolute path in a fresh temporary
  folder, single-quoted for the placeholder

`runVerificationCommand` SHALL take an optional record of extra environment
variables for this. The temporary folder SHALL be removed after the report is
read.

#### Scenario: Placeholders and environment
- **WHEN** the command is `node fake-mutate.cjs {mutate} {tests} {report}` for a pick of `quote`
- **THEN** the command receives `src/pricing/quote.ts:20-24,src/pricing/quote.ts:33-39`, `'tests/pricing-quote.test.ts'`, and the report path, and the same values in the three environment variables

### Requirement: Mutation report reading
osq SHALL treat the report as untrusted JSON and read only
`files[<file>].mutants[]`, and from each mutant `status`, `mutatorName`,
`replacement`, and `location.start.line` and `column`. It SHALL count only
mutants of the pick's file whose start line falls in one of its ranges:

- `Killed` and `Timeout` count as killed.
- `Survived` and `NoCoverage` count as survived.
- Any other status, or a mutant with a missing or mistyped field, counts as
  invalid.

Each survivor SHALL keep its file, line, column, mutator, and replacement, the
replacement cut to 200 characters. A report that is missing, isn't JSON, or
has no `files` object SHALL make the pick not measured with reason
`report_invalid`.

#### Scenario: Survivor recorded
- **WHEN** the report holds 18 killed mutants and one `Survived` `ConditionalExpression` at line 36, column 19, replaced with `false`
- **THEN** the pick records 18 killed, 1 survived, and that survivor

#### Scenario: Mutant outside the ranges
- **WHEN** the report holds a surviving mutant at line 5 of the same file
- **THEN** it isn't counted

### Requirement: Mutation check after a pass
When `traceability.mutation` is set and at least one capability is opted in,
`runWatcherCycle` SHALL run the mutation check right after `runTask` returns
success, before the change can archive. The check SHALL run the picks in
order, under `budgetSeconds` of total wall time for the task. Each run's
timeout is the budget left. The check SHALL append one `mutation_ran` event per
pick to the task's stream, with `file`, `function`, `ranges`, `scenarios`,
`tests`, `outcome`, `killed`, `survived`, `invalid`, `survivors`, `duration`,
and `exitCode`. The outcome is `measured` or `not_measured`, and a not-measured
event also has `reason`: `range_unknown`, `budget`, `timed_out`,
`command_failed`, or `report_invalid`. A `command_failed` or `timed_out` event
also has the command's output cut to its last 2,000 characters.

A pick whose ranges are unknown SHALL be recorded as `range_unknown` without
running. Picks left once the budget is spent SHALL be recorded as `budget`
without running. A nonzero exit is `command_failed`. The check SHALL catch
every error it meets, log it, and return. It never changes the task's done
state, markers, or retries.

#### Scenario: Budget runs out
- **WHEN** `budgetSeconds` is 1 and the first of two picks takes longer
- **THEN** the first is recorded as `timed_out`, the second as `budget`, and the task stays done

#### Scenario: Mutation unset
- **WHEN** `traceability.mutation` is unset
- **THEN** no mutation command runs and no `mutation_ran` event is appended

### Requirement: Git state recording
When `GitVcs` is selected, the runner SHALL record HEAD's commit and branch,
the index digest, and the stash list before it spawns the agent, and again
after the agent exits and before verify. When any of them differs, the runner
SHALL append one `vcs_violation` event with `moved`, the list of what differs
from `head`, `branch`, `index` and `stash`, and `before` and `after` holding
all four values. It SHALL log a warning that names what moved, how to put each
back, and that a human using git in this checkout during the task causes the
same result. Outside an osq worktree the task's outcome SHALL NOT change;
inside one, "Violations kill in a worktree" applies. A git read that fails
SHALL record nothing and log a warning.

#### Scenario: Agent commits
- **WHEN** the agent commits its edit and the task's verify passes
- **THEN** a `vcs_violation` event lists `head` in `moved` with both commits, and the task is done

#### Scenario: Agent stashes
- **WHEN** the agent runs `git stash` on the checked-out branch
- **THEN** a `vcs_violation` event lists `stash` in `moved`, and HEAD is unchanged in `before` and `after`

#### Scenario: Agent checks out another branch
- **WHEN** the agent checks out another branch
- **THEN** a `vcs_violation` event lists `branch` in `moved`

#### Scenario: Agent stages a file
- **WHEN** the agent runs `git add` on a file in its scope
- **THEN** a `vcs_violation` event lists `index` in `moved`

#### Scenario: Outside git
- **WHEN** a task runs under `NoVcs`
- **THEN** no `vcs_violation` or `scope_violation` event is recorded

### Requirement: Scope violation recording
When `GitVcs` is selected, the runner SHALL hash every file status lists
before it spawns the agent, with null for a deleted file. After the agent exits
and before verify, a file SHALL count as changed during the task when status
lists it now or before spawn and its status code or hash differs. A changed
file SHALL be a scope violation when the task's scope does not cover its path,
as `scopeCoversPath` judges it without reading the disk, and it is outside the
change folder. So a file the task deleted is covered by the scope entry that
names it, exactly or through a glob. A file under `tests/` that status lists
as untracked after the agent exits and did not list before spawn SHALL NOT be
a scope violation. The runner SHALL append one `scope_violation` event whose
`files` lists the violations sorted, and log a warning. Outside an osq
worktree the task's outcome SHALL NOT change; inside one, "Violations kill in
a worktree" applies. Under `NoVcs`, scope checks SHALL stay as they are.

#### Scenario: Edit outside scope
- **WHEN** the agent edits a tracked file outside its scope and the task's verify passes
- **THEN** a `scope_violation` event names that file, and the task is done

#### Scenario: Human edit before spawn
- **WHEN** a file outside scope was modified before spawn and the agent leaves it alone
- **THEN** no `scope_violation` event is recorded

#### Scenario: Agent edits a dirty file
- **WHEN** a file outside scope was modified before spawn and the agent edits it again
- **THEN** a `scope_violation` event names that file

#### Scenario: New test file
- **WHEN** the agent creates `tests/extra.test.ts` outside its scope
- **THEN** no `scope_violation` event is recorded

#### Scenario: Scoped file deleted
- **WHEN** the agent deletes a tracked file its scope names exactly, and another that a scope glob covers
- **THEN** no `scope_violation` event is recorded

#### Scenario: File outside scope deleted
- **WHEN** the agent deletes a tracked file outside its scope
- **THEN** a `scope_violation` event names that file

### Requirement: Relative verify output and archive path
The shared verification runner SHALL return output with the project root
replaced by relative paths, using the same rule as tool summaries, so
`verify_ran` events, dead and regressed markers, and prior failure context
never carry the project root. The `archived` event SHALL record `archivePath`
relative to the project root. Existing events and archives SHALL NOT be
rewritten.

#### Scenario: Absolute path in verify output
- **WHEN** a task's verify prints `<projectRoot>/src/a.ts` and fails
- **THEN** its `verify_ran` event and dead marker carry `src/a.ts` and not the project root

#### Scenario: Archived change
- **WHEN** a change is archived
- **THEN** its `archived` event's `archivePath` is `openspec/changes/archive/<folder>`

### Requirement: Baseline key
Under `GitVcs`, a baseline key SHALL hold HEAD's commit and a SHA-256 digest of
every status entry outside `.run/` folders, each as its path, status code, and
content hash, with null for a deleted file, in path order. Under `NoVcs`, or
when HEAD has no commit, there SHALL be no key.

#### Scenario: Same tree
- **WHEN** the key is read twice with no file changed, and only a `.run/` file written in between
- **THEN** both keys are equal

#### Scenario: Edited untracked file
- **WHEN** an untracked file outside `.run/` changes between two reads
- **THEN** the digests differ and the commits are equal

#### Scenario: Outside git
- **WHEN** the key is read under `NoVcs`
- **THEN** there is no key

### Requirement: Baseline verify before a change's first task
When `gates.baselineVerify` is set and none of the change's task streams holds
a `started` event, `runTask` SHALL settle the baseline before its pre-spawn
verify or agent spawn. It SHALL run the command in the project root
with `timeouts.verifyTimeoutSeconds` and without `OSQ_CHANGE`, and append one
`baseline_ran` event to the change stream with `outcome`, `command`, `commit`,
`treeDigest`, `exitCode`, and `durationSeconds`. A failed run's event SHALL
also have `output`, the command's full output, when that output is not empty.
When the command fails, the task SHALL die with `baseline_red`. Its dead
marker SHALL start with "tree was red before this change started", then name
the command, its exit code, and `osq retry <id> <n>`, then carry the output
excerpt, which ends with
`Full output: the baseline_ran event in .run/events/change.jsonl`. The outcome
line SHALL end with "tree was red before this change started". `baseline_red`
SHALL NOT be retried automatically.

#### Scenario: Green baseline
- **WHEN** the baseline command exits 0 before task 1 of a change
- **THEN** a `baseline_ran` event with `outcome: passed` precedes task 1's `started` event

#### Scenario: Retry after a red baseline
- **WHEN** a human fixes the tree and runs `osq retry <id> 1` after `baseline_red`
- **THEN** the baseline runs again before task 1 spawns

#### Scenario: Change already started
- **WHEN** task 2 of a change runs after task 1 started
- **THEN** no baseline runs and no `baseline_ran` event is appended

#### Scenario: Gate unset
- **WHEN** `gates.baselineVerify` is unset
- **THEN** no baseline runs and no `baseline_ran` event is appended

#### Scenario: Red baseline keeps its output
- **WHEN** the baseline command fails with 100 lines of output
- **THEN** its `baseline_ran` event has `outcome: failed` and the full output, and the `baseline_red` dead marker holds the last 40 lines and the `Full output:` line

### Requirement: Baseline reuse
Before running the command, the watcher SHALL find the latest `baseline_ran`
event with outcome `passed` or `reused` across the change streams of every
active and archived change. When that event's command equals the configured
command, and its commit and digest equal the current baseline key, the watcher
SHALL NOT run the command. It SHALL append a `baseline_ran` event with
`outcome: reused` and `reusedFrom`, the folder name of the change that
recorded it. Without a key, the command SHALL always run.

#### Scenario: Unchanged tree
- **WHEN** a second change's first task starts in a git repository whose HEAD and dirty files are unchanged since the first change's green baseline
- **THEN** its `baseline_ran` event has `outcome: reused` and names the first change, and the command did not run

#### Scenario: Changed file
- **WHEN** a tracked file changed after the first change's green baseline
- **THEN** the second change's baseline runs the command

### Requirement: Osq commit message
One function SHALL build every commit message osq makes for a task: the
subject, a blank line, the task title and the outcome line on their own lines,
a blank line, and trailers `Osq-Change: <folder>`, `Osq-Task: <n>`,
`Osq-Model: <harness> <model>`, and `Osq-Version: <osqVersion>`. The model
and version SHALL come from the last `started` event in
`.run/events/<n>.jsonl`; without one, those two trailers SHALL be left out.
The caller SHALL supply the outcome line, as `formatTaskOutcomeLine` writes it
with symbols off.

#### Scenario: Trailers parse
- **WHEN** a task's events hold a `started` event with harness `pi`, model `deepseek-flash`, and osqVersion `0.2.1`, then a second one with model `deepseek-pro`
- **THEN** `git interpret-trailers --parse` over the message prints `Osq-Change`, `Osq-Task`, `Osq-Model: pi deepseek-pro`, and `Osq-Version: 0.2.1`

#### Scenario: No started event
- **WHEN** the task's events file is missing
- **THEN** the message carries only the `Osq-Change` and `Osq-Task` trailers

### Requirement: Dead task record
Given a `Vcs` for an osq worktree, a change folder inside it, a task number, a
reason, the task title, and the outcome line, the dead record SHALL, in this
order: remove an existing `.run/dead/<n>.patch`; write `patch()` to
`.run/dead/<n>.patch`; discard every path `status` reports outside the change
folder, a rename's source included; then commit whichever of
`.run/dead/<n>.md`, `.run/dead/<n>.patch`, and `.run/events/<n>.jsonl` exist,
with subject `osq: <id> task <n> dead, reason <reason>`, the message from
"Osq commit message", and author `vcs.author`. It SHALL return the new
commit. It SHALL never discard or commit anything else inside the change
folder, so for `spec_conflict` the human's edits to the folder stay
uncommitted. When `vcs.author` is unset it SHALL fail before writing
anything.

#### Scenario: Agent edits put back
- **WHEN** a task dies with reason `verify_red` after the agent modified a tracked file and created `src/new.ts` in the worktree
- **THEN** the branch gains one commit holding only the three `.run/` files, the worktree status is empty outside `.run/`, and `git apply` of the committed patch on the worktree restores both edits

#### Scenario: Patch before discard
- **WHEN** discarding fails
- **THEN** `.run/dead/<n>.patch` already holds the agent's edits

#### Scenario: Spec conflict
- **WHEN** a task dies with reason `spec_conflict` after `tasks/1.md` in the worktree's change folder was edited
- **THEN** the dead commit holds only `.run/` files, and the edit to `tasks/1.md` remains, uncommitted

#### Scenario: Patch from an earlier try
- **WHEN** `.run/dead/<n>.patch` already holds `stale` from a failed try and the dead record runs again
- **THEN** the committed patch holds the agent's edits and does not contain `stale`

### Requirement: OpenCode v2 task execution
The opencode adapter SHALL run a task as `opencode run <prompt> --standalone
--agent <agent> --auto --format json --model <model>` with the project root as
the working directory, then one `--file` per attached file as before. It SHALL
pass no `--dir` and no `--variant`; a configured `opencode.variant` SHALL be
appended to the model as `<model>#<variant>`. After the process exits, when
the stream carried a `sessionID`, the adapter SHALL run `opencode session
export --standalone <sessionID>` and, when `info.tokens` and `info.cost`
exceed what the run's `tokens` events recorded, append one `tokens` event with
the difference, so a task's tokens and cost equal the session's totals. A
failed or unparseable export SHALL append nothing. Preflight SHALL exit 1 with
the "OpenCode diagnostics" failure message when the installed opencode is
below 2.0.0.

#### Scenario: Task argv
- **WHEN** `buildOpencodeArgs` runs with `opencode: { model: 'deepseek/deepseek-flash', variant: 'thinking' }`
- **THEN** the argv holds `--standalone`, `--model deepseek/deepseek-flash#thinking`, and neither `--dir` nor `--variant`

#### Scenario: Final step usage
- **WHEN** a fake opencode replays `observed/run-stream.jsonl` and exports `observed/session-export.json`
- **THEN** the task's events hold one `tool` event with tool `read` and summary `hello.txt`, one `text` event `banana`, and two `tokens` events whose prompt tokens sum to 9463 and whose cost sums to the export's `info.cost` within 1e-12

#### Scenario: Export fails
- **WHEN** the fake opencode's `session export` exits 1
- **THEN** the task's events hold only the streamed `tokens` event

#### Scenario: Opencode 1 preflight
- **WHEN** the watcher's preflight runs with an opencode that prints `1.14.3`
- **THEN** it prints the unsupported-version message and exits 1

### Requirement: Worktree run
The watcher cycle SHALL run a change the resolver reports from a worktree
tree with that tree's root as the project root, so the reaper, automatic
retries, the scope audit, the runner, verify with `OSQ_CHANGE`, the adapters,
the mutation check, and the archiver all work inside the worktree. Before it
spawns a task and before it archives, it SHALL check the worktree: HEAD SHALL
be on `osq/<folder>`, and status SHALL list nothing outside the change
folder's `.run/` other than the change folder's `tasks.md`. When HEAD is on
another branch or detached, it SHALL halt the change with reason
`worktree_off_branch` and the branch as the detail. When status lists other
files, it SHALL halt the change with reason `worktree_dirty` and the files,
one per line, as the detail. Changes in the project root SHALL run as before.

#### Scenario: Task runs in the worktree
- **WHEN** a change approved into a worktree has a pending task and a watcher cycle runs from the checkout
- **THEN** the adapter's `projectRoot` is the worktree, the task's verify runs there with `OSQ_CHANGE` set to the worktree's change folder, and the checkout's files and its copy of the change are unchanged

#### Scenario: Dirty worktree
- **WHEN** a file outside the change folder is modified in the worktree before a cycle
- **THEN** no task spawns and `.run/regressed/change.md` has reason `worktree_dirty` and names the file

#### Scenario: Off its branch
- **WHEN** the worktree has checked out another branch
- **THEN** no task spawns and `.run/regressed/change.md` has reason `worktree_off_branch` and names the branch

#### Scenario: Records are not dirt
- **WHEN** the worktree has uncommitted files only under the change folder's `.run/` and a ticked `tasks.md`
- **THEN** the next task spawns

### Requirement: Worktree halt
To halt a change in a worktree, the watcher SHALL write `.run/regressed/change.md`
with `reason: <reason>` in its frontmatter and the detail as its body, append
one `regressed` event with target `change`, that reason, and the detail as
`output`, and log one line naming the change and the reason. The change then
waits, as for any change-level regression, until a human runs
`osq retry <id> change`. A halt SHALL NOT be retried automatically.

#### Scenario: Human clears a halt
- **WHEN** a change halted with `worktree_dirty`, a human removes the file, and runs `osq retry <id> change`
- **THEN** the next cycle spawns the pending task

### Requirement: Verified task commit
After a task in a worktree passes and its mutation check has run, the watcher
SHALL make one commit holding every path status lists that the task's `scope`
covers, a deleted path and a rename's source included, every untracked file
under `tests/`, and the change folder's `.run/done/<n>`,
`.run/results/<n>.md`, `.run/events/<n>.jsonl`, and `tasks.md` when they
exist. Its subject SHALL be `osq: <id> task <n> verified`, its message SHALL
come from "Osq commit message" with the task's title and outcome line, and its
author SHALL be `vcs.author`. The outcome line SHALL be `formatTaskOutcomeLine`
with symbols off and the whole seconds since the task's last `started` event,
0 without one. Anything else status lists SHALL stay uncommitted, so the next
check halts on it by name. Each cycle, before picking a task for a change that
is not halted, the watcher SHALL make the same commit, in task order, for
every task whose `.run/done/<n>` status lists as untracked and whose marker is
not `manual: true`.

#### Scenario: Two tasks, two commits
- **WHEN** a two-task change in a worktree runs and each task edits one file in its scope
- **THEN** the branch gains `osq: <id> task 1 verified` and `osq: <id> task 2 verified`, each holding its task's file and records, and the worktree is clean outside `.run/` after each

#### Scenario: New test file outside scope
- **WHEN** a task creates `tests/new.test.ts` outside its scope and passes
- **THEN** the task's commit holds `tests/new.test.ts`

#### Scenario: Commit left undone
- **WHEN** a task's done marker is written and the watcher stops before its commit
- **THEN** the next cycle commits it as `osq: <id> task <n> verified` before spawning the next task

#### Scenario: Deleted scoped file
- **WHEN** a task with `tests.modify: true` deletes `src/old.ts` and `tests/old.test.ts`, both in its scope, and passes
- **THEN** the task is done, its commit records both deletions, and the worktree is clean outside `.run/`

### Requirement: Archive commit
After the archiver moves a change in a worktree into the archive, the watcher
SHALL make one commit holding the change folder's old path, the tree's archive
directory, and the living specs directory, with subject `osq: <id> archived`,
the proposal's title and `archived to <archivePath>` as its body lines, the
trailer `Osq-Change: <folder>`, and author `vcs.author`, built by
`formatCommitMessage`. After it the worktree SHALL be clean.

#### Scenario: Last task archives
- **WHEN** the last task of a change in a worktree passes
- **THEN** the branch's newest commit is `osq: <id> archived`, the change folder is under the worktree's archive directory with its deltas merged into the worktree's living specs, and `git status` in the worktree is empty

### Requirement: Dead path in a worktree
When a task in a worktree dies, because `runTask` returned a failure other
than `regressed` or `already_running`, or because the reaper recorded
`crashed` or `timeout` for its lock, the watcher SHALL record it through
"Dead task record" after the dead marker and event are written, with the
task's title and the outcome line `formatTaskOutcomeLine` writes with symbols
off, the reason, and the whole seconds since the task's last `started` event,
0 without one. Afterwards the branch tip SHALL be the last verified state plus
the dead record, and the worktree SHALL be clean outside the change folder.

#### Scenario: Verify fails
- **WHEN** a task in a worktree edits a file in its scope and its verify fails
- **THEN** the branch gains `osq: <id> task <n> dead, reason verify_red`, the file is back to its last committed state, and `.run/dead/<n>.patch` holds the edit

#### Scenario: Crash found after a restart
- **WHEN** a task's lock names a dead process and the worktree holds its edits when a cycle starts
- **THEN** the reaper's `crashed` death is committed with its patch, and the worktree is clean outside the change folder

### Requirement: Violations kill in a worktree
With `vcs.enabled`, when HEAD was on a branch starting with `osq/` before the
agent spawned, a `vcs_violation` or `scope_violation` that "Git state
recording" or "Scope violation recording" appends SHALL also kill the task
with that reason, before verify runs, even when verify would pass. The dead
marker's body SHALL be the logged warning for `vcs_violation` and the files,
one per line, for `scope_violation`. When both happen, the reason SHALL be
`vcs_violation`. A task whose spawn already failed SHALL keep that failure.

#### Scenario: Edit outside scope in a worktree
- **WHEN** an agent in an osq worktree edits a tracked file outside its scope and the task's verify would pass
- **THEN** `runTask` returns `scope_violation`, its dead marker names the file, and no `verify_ran` event follows the `scope_violation` event

#### Scenario: Agent commits in a worktree
- **WHEN** an agent in an osq worktree commits its edit
- **THEN** `runTask` returns `vcs_violation`

#### Scenario: Same edit in the checkout
- **WHEN** the same edit outside scope happens in a checkout on `main` with `vcs.enabled` off
- **THEN** a `scope_violation` event is recorded and the task is done

### Requirement: Lifecycle commands in a worktree
`retry`, `reject`, and `verified` SHALL act on the folder the change
locations module returns, so for a change that runs in a worktree they write
their markers in the worktree and never in the checkout. `rejectSpec` SHALL
read a change's markers in the change's own tree, move the change into that
tree's rejected directory, and then commit and remove the worktree as
"Rejection under version control" says. `retrySpec`'s recertification SHALL
run the task's verify and hash its scope in the change's own tree. osq SHALL
have no command that writes a done marker; only the watcher writes one.

#### Scenario: Reject a dead change in a worktree
- **WHEN** a change in a worktree has a dead task and a human runs `osq reject <id> --reason stop`
- **THEN** the change's branch holds the folder and its `.run/rejected.md` under the rejected directory, and the checkout's changes and rejected directories are unchanged

#### Scenario: Recertify in the worktree
- **WHEN** a done task in a worktree has a scope regression and its verify passes only in the worktree
- **THEN** `osq retry <id> <n>` recertifies it

#### Scenario: Manual done in the worktree
- **WHEN** a human runs `osq done <id> <n> --manual <reason>` for a change in a worktree
- **THEN** osq fails with an unknown command, and no `.run/done/<n>` is written in the worktree or the checkout

### Requirement: Stacked cut
With `vcs.enabled` and `GitVcs` selected, each watcher cycle SHALL, before it
lists changes, visit every active change in a stacked tree in numeric order,
skipping one that has `.run/regressed/change.md`. For each, it SHALL read
`.run/stacked-on` and the state of each line's dependency through "Stack
dependency state", and decide:

- a dependency that is `unapproved`, or `approved` or `archived` with a hash
  other than the recorded one, halts the change with `dependency_changed`;
- otherwise any `approved` dependency means the change waits, unchanged;
- otherwise, when every dependency is `landed`, the base is the default
  branch;
- otherwise the base is the `osq/<dependency>` branch of the first
  `archived` dependency, in line order, whose branch holds
  `<archive>/<other>` for every other `archived` dependency, and when none
  does, the change halts with `dependency_diverged`.

To cut, it SHALL create `osq/<folder>` at the base unless that branch
exists, add its worktree at the path "Worktree location" gives unless a
worktree has that branch, and run `vcs.prepare` there as approval does.
Unless the branch's tip already holds `<changes>/<folder>/.run/approved`, it
SHALL then replace the worktree's `<changes>/<folder>` with the stacked copy,
write `.run/base` there with the worktree's HEAD commit, and commit that
folder with subject `osq: <id> approved` and author `vcs.author`. Last, it
SHALL delete the stacked approval directory and log
`stacked <folder> on <base>: worktree <path>`. The same cycle SHALL then run
the change from its worktree. A cut that fails SHALL halt the change with
`stack_cut_failed` and the error's message, and SHALL keep the branch, any
worktree it added, and the stacked approval. After `osq retry <id> change`,
the next cycle cuts again and reuses the branch and worktree that exist. With `vcs.enabled` off, or under `NoVcs`,
the step SHALL do nothing.

#### Scenario: Chain approved at once
- **WHEN** `001-a` and `002-b`, with `depends_on: ["001"]`, are approved one after the other in a temporary repository and `runWatcherOnce` runs with an adapter that edits one file per task
- **THEN** `osq/001-a` ends with `osq: 001 archived`, `osq/002-b`'s first commit is `osq: 002 approved` whose parent is that archive commit and whose `.run/base` names it, `osq/002-b` ends with `osq: 002 archived`, the stacked approval directory is gone, and the checkout's files are unchanged

#### Scenario: Dependency still running
- **WHEN** `002-b` is stacked on `001-a` and `001-a` has a pending task that a cycle does not finish
- **THEN** no branch `osq/002-b` exists and `002-b` has no regression marker

#### Scenario: Dependency landed by hand
- **WHEN** `001-a` archived on its branch, a human squash-merges `osq/001-a` into `main` and commits, and a cycle runs
- **THEN** `osq/002-b` is cut from `main`'s tip and the log names `main` as the base

#### Scenario: Two dependencies on separate branches
- **WHEN** `003-c` depends on `001-a` and `002-b`, both archived on their own branches, and neither branch holds the other's archive
- **THEN** `003-c` halts with `dependency_diverged` and no branch `osq/003-c` exists

#### Scenario: Cut fails and resumes
- **WHEN** `vcs.prepare` exits 1 during the cut, then is fixed, and a human runs `osq retry <id> change`
- **THEN** the first cycle halts with `stack_cut_failed` and keeps the branch, the worktree at the path "Worktree location" gives, and the stacked approval, and the next cycle reuses that worktree and ends with exactly one `osq: <id> approved` commit on the branch and no stacked approval

#### Scenario: Flag off
- **WHEN** `vcs.enabled` is off and a stacked approval directory exists
- **THEN** a cycle creates no branch and writes nothing in that directory

### Requirement: Stacked halt
To halt a stacked change, the watcher SHALL write `.run/regressed/change.md`
in the stacked copy and append its `regressed` event and log line exactly as
"Worktree halt" does. The detail for `dependency_changed` SHALL be
`<dependency> was rejected or is no longer approved; approve <id> again` for
an `unapproved` dependency, and
`<dependency> was approved again after <id>; approve <id> again` for a changed
hash. The detail for `dependency_diverged` SHALL be
`<dependencies> archived on separate branches; land one and approve <id> again`,
the dependencies joined with ` and `. Approving the change again replaces the
stacked approval, and the halt with it.

#### Scenario: Dependency rejected before it lands
- **WHEN** `002-b` is stacked on `001-a` and `osq/001-a`'s tip holds `001-a` only under the rejected directory
- **THEN** a cycle halts `002-b` with `dependency_changed`, its marker contains `approve 002 again`, and no branch `osq/002-b` exists

#### Scenario: Dependency approved again
- **WHEN** the hash `.run/stacked-on` records for `001-a` differs from `001-a`'s current approved hash
- **THEN** a cycle halts `002-b` with `dependency_changed` and the approved-again detail

#### Scenario: Approve again clears the halt
- **WHEN** `002-b` halted because `001-a` was rejected, and a human approves `002-b` again
- **THEN** `osq/002-b` is cut from HEAD with its worktree, and no stacked approval of `002-b` remains

### Requirement: Rejection under version control
With `vcs.enabled` and `GitVcs` selected, after `rejectSpec` moves a change
in a worktree tree into that tree's rejected directory and records the
rejection, it SHALL commit, in the worktree, every path status lists under
the change's old folder and its rejected folder, with subject
`osq: <id> rejected`, the reason and `rejected to <path>` as body lines, the
trailer `Osq-Change: <folder>`, and author `vcs.author`, built by
`formatCommitMessage`. It SHALL then remove the worktree through
`worktreeRemove`, never by force, and keep the branch. When the worktree
still has other changes, or the commit or the removal fails, it SHALL keep
the worktree and report why. `osq reject` SHALL print
`  Worktree removed: <path>` or `  Worktree kept: <path> (<why>)`, then
`  Branch kept: osq/<folder>`. For a change in a stacked tree, `rejectSpec`
SHALL apply the same eligibility rules, then restore the change to the
checkout as "Stacked draft restore" says, delete the stacked approval
directory, move nothing else, and write no rejection record, because a
stacked approval has no branch to keep the plan. `osq reject` SHALL print
`  Withdrew stacked approval: <path>` in place of its `Destination` line,
then `  Restored draft: <path>`, the restored folder's path relative to the
project root.

#### Scenario: Reject removes a clean worktree
- **WHEN** a change in a worktree has a dead task and a human runs `osq reject <id> --reason stop`
- **THEN** the branch's newest commit is `osq: <id> rejected` holding the folder under the rejected directory and not under the changes directory, the worktree's directory and its `worktreeList` entry are gone, the branch remains, and the checkout's files are unchanged

#### Scenario: Dirty worktree kept
- **WHEN** the rejected change's worktree also has a modified file outside the change folder
- **THEN** the rejection commit is made without that file, the worktree and the file remain, and the output has a `Worktree kept:` line naming the worktree

#### Scenario: Not recreated after reject
- **WHEN** a change was rejected and its worktree removed, and `osq watch --once` runs
- **THEN** no worktree is created for its branch

#### Scenario: Reject a halted stacked change
- **WHEN** a stacked change halted with `dependency_changed` is rejected
- **THEN** its stacked approval directory is gone, no branch exists for it, the checkout holds its folder with the stacked copy's authored files and no `.run/approved`, and the output has the `Withdrew stacked approval:` line and then `  Restored draft: openspec/changes/<folder>`

### Requirement: Squash commit message
osq SHALL build the squash commit message for a change from the archived
change folder in its osq worktree, and SHALL write nothing while doing so.
It SHALL find that folder through the worktree trees `changeTrees` returns,
not through `listChanges`, so a checkout that already holds an archived
folder of the same name, as it does after `git merge --squash`, changes
nothing.
The message SHALL be, in order:

- The subject `osq: <id> <folder words>`, where `<id>` is the folder's
  numeric prefix and `<folder words>` is the rest of the folder name with each
  `-` replaced by a space.
- A blank line, then the proposal's `## Goal` section, trimmed.
- A blank line, then one outcome line per entry of `tasks.md`, in order:
  `[manual] task <n>: <title>` when the task's `.run/done/<n>` frontmatter
  holds `manual: true`, and `[verified] task <n>: <title>` otherwise.
- A blank line, then the trailers, one `<key>: <value>` per line:
  `Osq-Change: <folder>`; `Osq-Base: <.run/base>`; `Osq-Head: <sha>`, the
  head of the worktree on `osq/<folder>` as `worktreeList` reports it;
  `Osq-Approved: <.run/approved>`; `Osq-Approved-By: <.run/approver>`; then
  `Osq-Model: <harness> <model>` once for each distinct value, and
  `Osq-Version: <osqVersion>` once for each distinct value, in task order,
  as `readCommitTrailers` reads them from each task's events.
- One final newline.

Each file value SHALL be trimmed. A trailer whose file is missing or empty
SHALL be left out.

osq SHALL refuse, writing nothing, in these cases:

- With `vcs.enabled` off or `NoVcs` selected, it SHALL fail with
  `osq message needs vcs.enabled and git`.
- When the change is active in its worktree, it SHALL fail with
  `<folder> has not archived on osq/<folder>`.
- When no osq worktree holds an archived folder that matches the id, as
  `findChange` matches ids, it SHALL fail with
  `No archived change "<id>" in an osq worktree`.
- When `awaitedDependencies` returns any entry for the archived folder, the
  change is stacked on a dependency that has not landed, and it SHALL fail
  with `<folder> is stacked on <dependency folders, comma-separated>, which
  has not landed; land it first`.

#### Scenario: Message after archive
- **WHEN** a two-task change approved into a worktree has run to its archive commit, and both tasks' `started` events name the same harness, model, and osq version
- **THEN** the message's subject is `osq: <id> <folder words>`, its body holds the goal and `[verified] task 1: <title>` and `[verified] task 2: <title>`, and `git interpret-trailers --parse` prints `Osq-Change`, `Osq-Base`, `Osq-Head` equal to the tip of `osq/<folder>`, `Osq-Approved`, `Osq-Approved-By`, one `Osq-Model: <harness> <model>`, and one `Osq-Version`

#### Scenario: Two models
- **WHEN** task 1's last `started` event names harness `pi` and model `deepseek-flash`, and task 2's names `pi` and `deepseek-pro`
- **THEN** the trailers hold `Osq-Model: pi deepseek-flash` and then `Osq-Model: pi deepseek-pro`

#### Scenario: Manual task
- **WHEN** task 2's `.run/done/2` frontmatter holds `manual: true`, as markers an older osq's `osq done --manual` wrote do
- **THEN** its outcome line is `[manual] task 2: <title>`

#### Scenario: Not archived yet
- **WHEN** the change still runs in its worktree
- **THEN** it fails with `<folder> has not archived on osq/<folder>` and writes nothing

#### Scenario: Stacked on an unlanded dependency
- **WHEN** the change archived on a branch cut from its dependency's archive commit, and the dependency has not landed
- **THEN** it fails naming the dependency folder

#### Scenario: Flag off
- **WHEN** `vcs.enabled` is off
- **THEN** it fails with `osq message needs vcs.enabled and git`

#### Scenario: Checkout already holds the archive
- **WHEN** the checkout has run `git merge --squash osq/<folder>`, so its archive holds `<folder>` too, and the worktree is kept
- **THEN** `osq message <id>` prints the same message as before the merge, with `Osq-Head` equal to the tip of `osq/<folder>`

### Requirement: Sidecars at archive
After `applyOpenSpecDeltas`, archive SHALL write sidecars into
`<openspecRoot>/specs/`:

- For each `creates` entry with a group whose capability now has a living
  spec and no sidecar, `formatSidecar({ group })`.
- For each replacement `specs/<capability>/osq.yml` the change carries, a
  copy of it, replacing any sidecar there.

Nothing else SHALL write a sidecar except `osq migrate sidecars`. The
approval manifest SHALL record, for every capability it records a spec hash
for, `hashes["<capability>/osq.yml"]`: the sidecar's hash, or null when it
has none.

#### Scenario: Created with a group
- **WHEN** a change with `creates: [{ name: gadgets, group: inventory }]` archives
- **THEN** `openspec/specs/gadgets/osq.yml` holds `group: inventory`

#### Scenario: Bare creation
- **WHEN** a change with `creates: [gadgets]` archives
- **THEN** no `openspec/specs/gadgets/osq.yml` is written

#### Scenario: Replacement
- **WHEN** a change carrying `specs/pricing/osq.yml` with `group: sales` archives and `pricing` had `group: inventory`
- **THEN** the living sidecar holds `group: sales`

#### Scenario: Manifest hashes
- **WHEN** a change that writes `pricing` is approved and `pricing` has a sidecar
- **THEN** the manifest holds `pricing/osq.yml` with that sidecar's hash, and `null` for a written capability without one

### Requirement: Watcher sync
With `vcs.enabled` on and `GitVcs` selected, the watcher cycle SHALL run
`syncWithDefaultBranch` for a change running in a worktree, passing a progress
callback that logs each line, at two points and no others:

- Before it spawns a task, after the worktree check of "Worktree run" passes
  and before the scope audit, when no task of the change has a
  `.run/done/<n>` marker.
- Before it archives, after that worktree check passes and before
  `checkAndArchiveSpec`.

It SHALL skip both while `awaitedDependencies`, given the checkout's project
root, lists any entry for the change, because a stacked dependent's branch
holds its dependency's archive until the dependency lands. When the sync
stops, the watcher SHALL halt the change as "Worktree halt" says, with the
stop's `reason`, `requirement_changed`, `sync_conflict`, `sync_verify_red`,
or `sync_failed`, and the stop's message as the detail. The first three are
steering triggers, so the watcher then leaves the change alone as "Watcher
leaves a change that needs steering" says. It SHALL then spawn nothing and archive nothing for that change in
that cycle. Any other error the sync throws SHALL halt it the same way with
`sync_failed`. After a sync that merged, the cycle SHALL derive the change's
state again before it picks the task.

#### Scenario: Sync before the first task
- **WHEN** a commit adding `src/other.txt` lands on the default branch after a change is approved into a worktree, and a watcher cycle runs
- **THEN** the branch holds `osq: <id> sync main` before `osq: <id> task 1 verified`, and `src/other.txt` existed in the worktree when the adapter spawned task 1

#### Scenario: No sync between tasks
- **WHEN** the default branch gains a commit after task 1 of a two-task change is verified
- **THEN** task 2 spawns with no sync commit after task 1's commit, and `osq: <id> sync main` comes after task 2's commit and before `osq: <id> archived`

#### Scenario: Conflict halts the change
- **WHEN** the default branch changes the same line of a file that the change's only task changed, after the task is verified and before archive
- **THEN** `.run/regressed/change.md` has reason `sync_conflict` and names the file, no `osq: <id> archived` commit exists, and the worktree's HEAD is the task's commit

#### Scenario: Stacked dependent waits for its dependency
- **WHEN** `002` was cut from `001`'s archive commit, `001` has not landed, and the default branch moved
- **THEN** `002` runs and archives with no sync commit on its branch

#### Scenario: Dependency lands during the dependent's run
- **WHEN** `002` was cut from `001`'s archive commit, and while `002`'s task runs the default branch gains an unrelated commit and `osq land 001` lands `001`
- **THEN** `002` archives after `osq: 002 sync main`, and `osq land 002` then lands it

#### Scenario: Red verify before archive needs steering
- **WHEN** the default branch gains a commit that makes the only task's `verify` exit 1, after the task is verified and before archive
- **THEN** `.run/regressed/change.md` has reason `sync_verify_red`, and later cycles write no commit and spawn nothing for the change

### Requirement: Test gate paths
`src/core/run/test-gate.ts` SHALL export `TEST_GATE_DIR`, `tests`, and
`isGatedTestPath`, true for `tests` and paths under `tests/`. These are the
paths the frozen-test gate governs; unlike traceability's "Test paths", a
`.test.` file outside `tests/` is not one. The runner's test snapshot, the git
guard and task commit's new test files, and spec lint's gate checks SHALL use
them and define none of their own.

#### Scenario: Gated and ungated paths
- **WHEN** `isGatedTestPath` is called with `tests`, `tests/a.test.ts`, `tests/sub/b.ts`, `src/a.test.ts`, `testsuite/a.ts`, and `src/tests/a.ts`
- **THEN** it returns true, true, true, false, false, and false

#### Scenario: One gate definition
- **WHEN** the sources of `src/watcher/verify.ts`, `src/watcher/git-guard.ts`, `src/core/run/task-commit.ts`, `src/core/spec/linter.ts`, `src/core/spec/test-impact.ts`, and `src/core/spec/digest.ts` are read
- **THEN** none compares a path with `'tests'` or `'tests/'` itself, and each imports from `src/core/run/test-gate.ts`

### Requirement: Throwing spawn kills the task
When a harness adapter's `spawn` throws, the runner SHALL handle it as an
agent that exited with code -1 and the thrown message as its error: it writes
`.run/dead/<n>.md` with `reason: crashed`, emits a `dead` event, and returns a
failed task result. The throw SHALL NOT reach the watcher loop.

#### Scenario: Spawn E2BIG
- **WHEN** the adapter's `spawn` throws an error with message `spawn E2BIG`
- **THEN** `runTask` resolves as failed with reason `crashed`, and `.run/dead/<n>.md` holds `reason: crashed` and `spawn E2BIG`

### Requirement: Approval commit before any worktree step
While a worktree change folder's `.run/approved` does not exist at the
worktree's HEAD, the watcher SHALL skip that change for the cycle before the
stale-lock reaper and every later step, and write no marker, event, or commit
for it. It SHALL read this from git on every cycle, so the cycle after the
approval commit handles the change as usual. A change outside a worktree, or
a worktree without git, SHALL NOT be checked.

#### Scenario: Seal before commit
- **WHEN** a worktree change's folder, with `.run/approved`, is on disk but its approval commit is missing, and a cycle runs
- **THEN** no task spawns, and the change has no `.run/regressed/change.md` and no new event

#### Scenario: Commit lands
- **WHEN** the change folder is then committed in the worktree and another cycle runs
- **THEN** the pending task spawns

### Requirement: Verify output excerpt in markers
Every marker the watcher builds from a command's output SHALL hold an excerpt
of that output in place of the whole output. These are the `verify_red` and
`scope_regression` regressed markers, and the `verify_red` (task verify and
focused run), `verify_precondition`, `change_verify_red`, and `baseline_red`
dead markers. Wherever another requirement says such a marker carries output,
it carries this excerpt. `excerptVerifyOutput` in
`src/core/run/verify-excerpt.ts` SHALL build every excerpt from the run's
whole output.

When the output has a line that starts with `✖ failing tests:` after leading
whitespace, the excerpt SHALL be the last such line through the end of the
output. Otherwise it SHALL be the last `limits.markerOutputLines` lines of the
output. Output that is empty or only whitespace SHALL become `(no output)`. Any
excerpt line longer than `limits.markerLineChars` characters SHALL be cut to
its first `limits.markerLineChars` characters followed by
`… (<n> more characters)`, where `<n>` is the number of characters cut.

The excerpt SHALL end with a line naming where the whole output is. For a
marker built from a verify that wrote a `verify_ran` event (task verify,
pre-spawn, change verify, archive verify, and scope audit), it SHALL be
`Full output: <log>`, where `<log>` is that event's `log` from "Verify output
logs", such as `Full output: .run/logs/change-3.log`. For a focused run it
SHALL be `Full output: the focused_ran event in .run/events/<n>.jsonl`, and for
a baseline `Full output: the baseline_ran event in .run/events/change.jsonl`;
those two events SHALL keep the full output. A timed-out task verify's
`verify_red` marker SHALL keep its timeout message and hold no excerpt.

#### Scenario: Archive failure keeps the failing tests
- **WHEN** archive-time change-level verification fails and its output is 500 lines followed by a `✖ failing tests:` section
- **THEN** `.run/regressed/change.md` holds the section and none of the 500 earlier lines, and its last line is `Full output: <log>` for the `log` of the `verify_ran` event in `.run/events/change.jsonl`
- **AND** that log file holds the full output

#### Scenario: Output without a failing-tests section
- **WHEN** a failing verify prints 100 numbered lines and no `✖ failing tests:` line, with `limits.markerOutputLines` at 40
- **THEN** the marker holds lines 61 through 100 and none of lines 1 through 60

#### Scenario: Long line cut
- **WHEN** a kept output line is 1,000 characters long and `limits.markerLineChars` is 400
- **THEN** the marker holds its first 400 characters followed by `… (600 more characters)`

#### Scenario: Task verify dead marker
- **WHEN** task 1's verify fails with 100 lines of output
- **THEN** `.run/dead/1.md` holds the last 40 lines and ends with `Full output: .run/logs/1-<n>.log`, naming the log of that run, which holds all 100 lines

#### Scenario: Change verify dead marker
- **WHEN** the change-level verify fails after task 1's verify passes
- **THEN** `.run/dead/1.md` holds the excerpt and ends with `Full output: .run/logs/change-<n>.log`, naming the log of that run

#### Scenario: Focused run dead marker
- **WHEN** a focused scenario test fails with 100 lines of output
- **THEN** `.run/dead/<n>.md` holds the excerpt after `Watcher focused scenario tests failed:` and ends with `Full output: the focused_ran event in .run/events/<n>.jsonl`

#### Scenario: Scope regression marker
- **WHEN** a scope audit re-runs a done task's verify and it fails with 100 lines of output
- **THEN** `.run/regressed/<n>.md` keeps its differing paths and holds the excerpt, ending with `Full output: .run/logs/<n>-<k>.log`, naming the log of that run

#### Scenario: Empty output
- **WHEN** a failing verify prints nothing
- **THEN** the excerpt is `(no output)` followed by the `Full output:` line

### Requirement: Role environments
`buildRoleEnv` in `src/core/run/role-env.ts` SHALL build the environment of
every process osq spawns for a role, where the role is `prepare`, `agent`, or
`verify`. It SHALL take the role and an options object with an optional
config, an optional harness name, optional extra variables, and an optional
source environment that defaults to `process.env`. The harness SHALL default
to the config's `harness`, then to `DEFAULT_CONFIG.harness`. From the source
it SHALL copy only these variables, and only when set:

- the names in the exported `BASE_ENV_NAMES`: `PATH`, `HOME`, `USER`,
  `LOGNAME`, `SHELL`, `LANG`, `LANGUAGE`, `LC_ALL`, `LC_CTYPE`, `TERM`, `TZ`,
  `TMPDIR`, `TMP`, `TEMP`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`,
  `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`, `NODE_EXTRA_CA_CERTS`,
  `SSL_CERT_FILE`, `SSL_CERT_DIR`, `CI`, `NO_COLOR`, `SYSTEMROOT`, `COMSPEC`,
  `PATHEXT`, `WINDIR`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, and
  `PROGRAMDATA`
- every variable whose name starts with `OSQ_`
- the names the config lists in `confinement.roles.<role>.env`
- for the agent role, the names the harness's catalog entry lists in
  `agentEnv`

For the prepare and verify roles it SHALL leave out every name the harness's
`agentEnv` lists, even when the config lists it for that role. Extra
variables SHALL be set last and win. On Windows a name SHALL match regardless
of case. The built environment SHALL be a new object, and the source SHALL
never change.

`runVerificationCommand` SHALL take an optional options object after the
change folder, with an optional `role` (`verify` or `prepare`, default
`verify`), an optional `config`, and optional `extraEnv`. It SHALL build the
environment with `buildRoleEnv`, then apply the `OSQ_CHANGE` rule from
"Change folder in verify environment", then set `extraEnv`. `runPrepare`
SHALL use the prepare role. Every other caller in `src/` SHALL use the verify
role and pass the config it holds: task, change, archive, and regression
verifies, a change's `check` command, focused runs, mutation checks, the
baseline verify, retry recertification, and sync verify.

#### Scenario: Base and OSQ variables pass
- **WHEN** `buildRoleEnv('verify', { source })` runs with `PATH`, `HOME`, `OSQ_FAKE_MODE`, and `AWS_SECRET_ACCESS_KEY` in the source
- **THEN** the result holds `PATH`, `HOME`, and `OSQ_FAKE_MODE`, and no `AWS_SECRET_ACCESS_KEY`

#### Scenario: Configured verify name
- **WHEN** the config lists `DATABASE_URL` in `confinement.roles.verify.env` and the source sets it
- **THEN** the verify role holds `DATABASE_URL`, and the prepare and agent roles do not

#### Scenario: Agent gets its harness keys
- **WHEN** `buildRoleEnv('agent', { harness: 'claude', source })` runs with `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` in the source
- **THEN** the result holds `ANTHROPIC_API_KEY` and no `OPENAI_API_KEY`

#### Scenario: Verify never gets the model key
- **WHEN** the config's harness is `claude`, it lists `ANTHROPIC_API_KEY` in `confinement.roles.verify.env` and `confinement.roles.prepare.env`, and the source sets it
- **THEN** neither the verify nor the prepare role holds `ANTHROPIC_API_KEY`

#### Scenario: Extra variables win
- **WHEN** the source sets `OSQ_TASK_NUMBER=9` and the extra variables set `OSQ_TASK_NUMBER=1`
- **THEN** the result's `OSQ_TASK_NUMBER` is `1`

#### Scenario: Verify command sees only its role
- **WHEN** `runVerificationCommand` runs a command that prints its environment, with a config listing `VERIFY_PROBE` for verify, while osq's environment sets `VERIFY_PROBE` and `SECRET_PROBE`
- **THEN** the output holds `VERIFY_PROBE` and no `SECRET_PROBE`

#### Scenario: Prepare sees only its role
- **WHEN** `runPrepare` runs `vcs.prepare` with a config listing `NPM_TOKEN` for prepare and `VERIFY_PROBE` for verify, both set
- **THEN** the prepare command sees `NPM_TOKEN` and no `VERIFY_PROBE`

#### Scenario: Watcher verifies use the verify role
- **WHEN** the watcher runs a task whose verify and change-level verify exit 0 only when `VERIFY_PROBE` is set and `SECRET_PROBE` is unset, with a config listing `VERIFY_PROBE` for verify and a baseline verify doing the same check
- **THEN** the baseline, the task verify, and the change verify all pass, and the task is done

### Requirement: Agent role environment
Each harness adapter's task spawn (agy, opencode, codex, pi, and claude) SHALL
pass the child the environment `buildRoleEnv('agent', ...)` builds with the
task's config, the adapter's own harness name, and extra variables
`OSQ_TASK_NUMBER` and `OSQ_SPEC_FOLDER`. It SHALL NOT spread `process.env`.
Interactive planner sessions, version probes, usage reads, and session
exports SHALL keep osq's environment.

#### Scenario: Claude task environment
- **WHEN** the claude adapter spawns a fake binary that records its environment, while osq's environment sets `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, and `SECRET_PROBE`
- **THEN** the record holds `ANTHROPIC_API_KEY`, `OSQ_TASK_NUMBER`, and `OSQ_SPEC_FOLDER`, and neither `OPENAI_API_KEY` nor `SECRET_PROBE`

#### Scenario: Configured agent name
- **WHEN** the codex adapter spawns a fake binary with a config listing `AGENT_PROBE` in `confinement.roles.agent.env`, while osq's environment sets `AGENT_PROBE` and `SECRET_PROBE`
- **THEN** the record holds `AGENT_PROBE` and no `SECRET_PROBE`

### Requirement: OpenCode executor agent permissions
`OPENCODE_AGENT_TEMPLATE`, the executor agent file `osq setup` writes when
none exists, SHALL set `bash` to a map rather than `allow`: `"*": allow`, then
`deny` for `"git"`, `"git *"`, `"curl *"`, `"wget *"`, `"ssh *"`, `"scp *"`,
and `"sudo *"`. `read`, `edit`, `glob`, and `grep` SHALL stay `allow`, and
`webfetch` and `websearch` SHALL stay `deny`. An existing agent file's
frontmatter SHALL stay as it is.

#### Scenario: New agent file denies git and network tools
- **WHEN** `osq setup` writes a new `.opencode/agent/osq-coder.md`
- **THEN** its frontmatter's `bash` maps `*` to `allow` and each of `git`, `git *`, `curl *`, `wget *`, `ssh *`, `scp *`, and `sudo *` to `deny`

#### Scenario: Existing agent file keeps its permissions
- **WHEN** `osq setup` runs with an existing agent file whose frontmatter sets `bash: allow`
- **THEN** that line is unchanged and only the managed block is refreshed

### Requirement: Change check at archive
After the change-level verification passes, the watcher SHALL run the
proposal's `check` command, when `readCheckCommand` finds one, through
`verifyArchiveStep` with target `change`, as it runs that verify. A check that
fails, times out, or names a missing path SHALL be handled exactly as a failed
change-level verify: the living specs go back, the change stays unarchived,
and `.run/regressed/change.md` records the regression.

#### Scenario: Check passes
- **WHEN** a change's verify passes and its `check: node check.cjs` exits 0
- **THEN** the change archives, and `.run/events/change.jsonl` holds a `verify_ran` event whose command is `node check.cjs`

#### Scenario: Check fails
- **WHEN** a change's verify passes and its `check: node check.cjs` exits 1
- **THEN** the change stays unarchived, `.run/regressed/change.md` has reason `verify_red` and command `node check.cjs`, and the living specs are what they were before archive began

### Requirement: Archived event without a verification requirement
The `archived` event SHALL carry only `archivePath`, whatever the proposal's
human steps and `check` command are.

#### Scenario: After-landing steps
- **WHEN** a change whose `### After landing` lists a step and whose frontmatter has `check: node check.cjs` is archived
- **THEN** its `archived` event's data is exactly `{ archivePath }`

### Requirement: Watcher leaves a change that needs steering
Each cycle, after the reaper and the automatic-retry step and before a
worktree change's pending commits, archive-spec restore, and clean-tree check,
`runWatcherCycle` SHALL skip a change whose derived state has `steering`, as
the status-inspection requirement "Steering triggers" defines it. For such a
change the cycle SHALL write no marker, event, or commit, SHALL NOT halt it,
spawn a task, or archive it, and SHALL NOT count it as approved and waiting.
The change runs again once its triggers are retired, by approval after
steering or by `osq retry`. Because a second identical death becomes stuck in
the automatic-retry step, that step SHALL still run for the change in the cycle
that marks it stuck.

#### Scenario: Plan edited in the worktree
- **WHEN** task 2 of a change in a worktree died with `blocked`, `tasks/2.md` and `plan-prompt.md` in its worktree folder are edited, and a watcher cycle runs
- **THEN** no `.run/regressed/change.md` exists, the worktree's HEAD is unchanged, and no task spawns

#### Scenario: Stuck after the second death
- **WHEN** a task with `gates.autoRetries` of 1 dies twice with the same output
- **THEN** the cycle after the second death marks it stuck, and later cycles spawn nothing for its change

#### Scenario: Retried trigger runs again
- **WHEN** a human runs `osq retry <id> <n>` for a stuck task and a watcher cycle runs
- **THEN** the task spawns again

### Requirement: Trusted manifest approval time shares the report's reads
The trusted approval time of a change SHALL be the manifest's `approvedAt`
only when the change folder holds `.run/approved` and the value parses as a
date. It SHALL read `.run/manifest.json` through the report's shared
change-file reads, so one `osq report` run reads each manifest once however
many report paths ask for its approval time. Outside a report run it SHALL
read the manifest from disk each time, and a missing, unreadable, or malformed
manifest SHALL give no approval time.

#### Scenario: Approval time asked twice in one report run
- **WHEN** one `osq report` run asks for an approved change's trusted approval time from two report paths
- **THEN** its `.run/manifest.json` is read once, and both get the manifest's `approvedAt`

#### Scenario: Unmarked approval time
- **WHEN** a change's manifest has a valid `approvedAt` but the folder has no `.run/approved`
- **THEN** the change has no trusted approval time

### Requirement: Provider outage deaths
A task attempt's events SHALL be those after its last `started` event. When the
agent of an attempt crashes or times out while the attempt holds a
`harness_retry` start with no later `harness_retry` end carrying
`success: true`, the task SHALL die with reason `provider_unavailable`. Its
dead marker body SHALL read `The model provider did not answer: <error>`, with
the error of the latest such start, or `no error reported` when none carried
one. Every other crash or timeout SHALL keep its reason.

#### Scenario: Provider never answered
- **WHEN** an attempt holds a `harness_retry` start with DeepSeek's error and no successful end, and the agent times out
- **THEN** the task dies with `provider_unavailable`, a `dead` event carries that reason, and the marker quotes DeepSeek's error

#### Scenario: Provider recovered before the timeout
- **WHEN** an attempt holds a `harness_retry` start followed by an end with `success: true`, and the agent later times out
- **THEN** the task dies with `timeout`

### Requirement: Provider stall stop
While a task runs, the watcher SHALL stop its agent with SIGTERM once the
attempt's open provider retry has lasted `gates.providerStallSeconds`, checking
at least every `log.heartbeatSeconds` when that is positive. A value of 0 SHALL
turn the early stop off.

#### Scenario: Stalled task stopped early
- **WHEN** an attempt's open provider retry started longer ago than `gates.providerStallSeconds` and the agent is still running
- **THEN** the watcher stops the agent before the task timeout, and the task dies with `provider_unavailable`

### Requirement: Provider outage retries
A task that died with `provider_unavailable` SHALL be retried automatically
once `gates.providerRetryDelaySeconds` have passed since its latest `dead`
event, up to `gates.providerRetries` such retries since the later of the
manifest's `approvedAt` and its last manual retry. They SHALL NOT count toward
`gates.autoRetries`, and `gates.autoRetries: 0` SHALL turn them off too.

#### Scenario: Waits, then retries
- **WHEN** a task dies with `provider_unavailable`
- **THEN** no `retry` event is appended before the delay has passed, and one automatic `retry` event with reason `provider_unavailable` is appended after it

#### Scenario: Separate budget
- **WHEN** a task with `gates.autoRetries` of 1 dies twice with `provider_unavailable` and `gates.providerRetries` is 3
- **THEN** it is retried automatically both times, and a later `verify_red` death still gets its one automatic retry

#### Scenario: Budget exhausted
- **WHEN** a task has had `gates.providerRetries` automatic provider retries and dies with `provider_unavailable` again
- **THEN** it stays dead until a human runs `osq retry`

### Requirement: Agy permissions
`DEFAULT_CONFIG.agy.dangerouslySkipPermissions` SHALL be `false`. The agy
adapter SHALL pass `--dangerously-skip-permissions` to a task or an
interactive session only when `agy.dangerouslySkipPermissions` is `true`. A
headless agy run denies every tool call it cannot prompt for, so the agy
adapter's `preflight` SHALL reject, before any task spawns, when that setting
is not `true`, with an error naming `agy.dangerouslySkipPermissions`.

#### Scenario: Bypass not set
- **WHEN** the agy adapter builds a task's argv and runs its preflight with `agy.dangerouslySkipPermissions` unset
- **THEN** the argv has no `--dangerously-skip-permissions`, and the preflight rejects naming `agy.dangerouslySkipPermissions`

#### Scenario: Bypass set on purpose
- **WHEN** `agy.dangerouslySkipPermissions` is `true`
- **THEN** the task argv and the interactive argv carry `--dangerously-skip-permissions`, and the preflight resolves

#### Scenario: Interactive planning without the bypass
- **WHEN** `AgyAdapter.spawnInteractive` runs with `agy.dangerouslySkipPermissions` unset
- **THEN** its argv has no `--dangerously-skip-permissions`, and agy prompts the human as usual

### Requirement: Validator run at archive
When the config's `validator` is enabled, `checkAndArchiveSpec` SHALL call
`runValidator` in `src/watcher/validator.ts` once every archive verification
step has passed, the `check` included, and before the folder moves to the
archive. `runValidator` SHALL spawn the validator's adapter once. The adapter
comes from `getHarnessAdapter` for the validator's harness unless the caller
passes one. The spawn SHALL use the change's tree root as `projectRoot`,
`taskNumber` `validator`, tier `smart`, the validator's `timeoutSeconds`, the
config `validatorRunConfig` returns, and, as `prompt`, the text
`buildValidatorPrompt` returns. A spawn that throws SHALL be caught.

Then it SHALL append one `validator_ran` event to the change's
`.run/events/change.jsonl` with data `outcome`, `harness`, `model`,
`duration` in wall seconds, `exitCode` (null when nothing exited),
`scenarios` (how many scenarios were judged), `findings`, and `restored`. A
`not_run` event also has `reason`, and a failed or unreadable run has
`output`. The outcome SHALL be:

- `not_run`, without spawning, with reason `no_base` when git is off or
  `.run/base` is missing or empty, or `no_scenarios` when no scenario is to
  be judged
- `timed_out` when the spawn result says it timed out
- `failed` when the spawn throws or exits nonzero, with `output` the error
  text cut to its last 2,000 characters
- `unreadable` when it exits 0 and `.run/validator/findings.json` is missing
  or `parseValidatorFindings` returns null, with `output` the file's text cut
  to its last 2,000 characters, or empty when the file is missing
- `validated` otherwise

Only a `validated` event SHALL carry findings; every other outcome has an
empty list. After the event, `.run/validator/` SHALL be removed. Beyond
waiting for its timeout, nothing the validator does SHALL change whether the
change archives. `runValidator` SHALL catch every error, log it, append a
`failed` event when it can, and return, and `checkAndArchiveSpec` SHALL then
relocate the folder as before. A missing or disabled validator SHALL spawn
nothing and append no event.

#### Scenario: Findings recorded
- **WHEN** a change with `.run/base` archives in a linked osq worktree, and the validator's adapter writes a findings file holding one `no_test` finding
- **THEN** the change archives, its archived `change.jsonl` holds a `validator_ran` event with outcome `validated` and that finding, and `.run/validator/` is gone

#### Scenario: Validator throws
- **WHEN** the validator adapter's `spawn` throws
- **THEN** the change archives and its `validator_ran` event has outcome `failed` and the error text as `output`

#### Scenario: Validator times out
- **WHEN** the validator adapter's `spawn` returns `timedOut: true`
- **THEN** the change archives and its `validator_ran` event has outcome `timed_out` and no findings

#### Scenario: Findings unreadable
- **WHEN** the adapter exits 0 and the findings file holds `not json`
- **THEN** the change archives and its `validator_ran` event has outcome `unreadable`, `output` `not json`, and no findings

#### Scenario: No base
- **WHEN** a change archives outside git with the validator enabled
- **THEN** the change archives, no adapter is spawned, and its `validator_ran` event has outcome `not_run` and reason `no_base`

#### Scenario: Validator off
- **WHEN** a change archives with no `validator` in the config
- **THEN** no adapter is spawned and no `validator_ran` event is appended

### Requirement: Validator inputs
`readValidatorInputs` in `src/watcher/validator-inputs.ts` SHALL gather what
osq gives the validator, or return `{ notRun: 'no_base' }` when git is off or
`.run/base` is missing or empty, and `{ notRun: 'no_scenarios' }` when no
scenario is judged. It gathers:

- `base`, the trimmed contents of `.run/base`
- `deltaPaths`, the change's `specs/<capability>/spec.md` files,
  project-relative, in capability name order
- `scenarios`, from `judgedScenarios`, given each delta spec and the same
  capability's living spec at the base, read with
  `vcs.show(base, <paths.features>/<capability>/spec.md)`. A scenario is
  judged when it belongs to an ADDED or MODIFIED requirement and the living
  spec at the base has no requirement of that name holding a scenario with
  the same name and the same text, compared with surrounding whitespace
  trimmed. They come in capability order, then document order.
- `patch`, `vcs.patch(base)` with every file whose path starts with
  `<paths.openspecRoot>/` left out
- `testPaths`, the files left in the patch that `isTestPath` accepts and that
  exist, sorted
- `resultPaths`, the change's `.run/results/<n>.md` files that exist, in task
  number order, project-relative

Before spawning, `runValidator` SHALL remove any old
`.run/validator/findings.json`, then write the patch to
`.run/validator/diff.patch` and the text `formatScenariosFile` returns to
`.run/validator/scenarios.md`.

#### Scenario: Unchanged scenario not judged
- **WHEN** a MODIFIED requirement repeats a scenario of the living spec at the base word for word and adds one new scenario
- **THEN** `judgedScenarios` holds only the new scenario

#### Scenario: Specs left out of the patch
- **WHEN** a change's tree differs from its base in `src/a.ts`, `tests/a.test.ts`, and `openspec/specs/x/spec.md`
- **THEN** the inputs' patch has no block for `openspec/specs/x/spec.md`, and `testPaths` is `tests/a.test.ts`

#### Scenario: Missing base
- **WHEN** `.run/base` does not exist
- **THEN** `readValidatorInputs` returns `{ notRun: 'no_base' }`

### Requirement: Validator prompt
`buildValidatorPrompt` in `src/watcher/validator-prompt.ts` SHALL build the
validator's whole prompt. It SHALL first say that the validator judges
whether the change does what its delta specs say, reads but never edits code,
tests, or specs, and never runs git. It SHALL then name the change folder,
the delta spec paths, the scenarios file, the patch file, the tests the
change added or changed, and the findings file. Then come the rules. The
validator judges only the listed scenarios. It may read any file in the
repository, including tests the change did not touch, and runs no build or
test command. It reports a finding only for one of three problems:
`no_code`, when no code meets the scenario; `no_test`, when no test checks
its THEN; or `passes_without_change`, when the scenario describes behavior
the base did not have and its test would still pass on the base code. It
reports nothing about style, naming, or architecture. Only after the rules
SHALL the prompt list the executor result paths, under
`Executor claims (check them; do not start from them):`. It SHALL end with
the findings file's JSON format and the line
`CRITICAL: Before exiting, write <findings path>. Change no other file. Never run git.`

#### Scenario: Claims come last
- **WHEN** the prompt is built for a change with one delta, one changed test, and one result file
- **THEN** the delta path, the scenarios file, the patch file, and the test path all come before the claims heading, the result path comes after it, and the last line is the `CRITICAL:` line

### Requirement: Validator findings file
The validator SHALL write `.run/validator/findings.json` as
`{"findings": [...]}`. Each finding SHALL be an object with `kind`
`scenario` and non-empty strings `capability`, `requirement`, `scenario`,
`problem`, and `detail`, where `problem` is `no_code`, `no_test`, or
`passes_without_change`. `parseValidatorFindings` in
`src/watcher/validator-findings.ts` SHALL return the findings in file order
with their strings trimmed. It SHALL return null when the text is not JSON,
has no `findings` array, or holds any finding with another kind or problem,
or a missing or empty field. `{"findings": []}` is a run with no findings.
`kind` leaves room for a second kind of finding in a later change.

#### Scenario: Valid findings
- **WHEN** `parseValidatorFindings` reads one `no_code` finding with every field set
- **THEN** it returns that one finding

#### Scenario: Unknown problem
- **WHEN** a finding's `problem` is `style`
- **THEN** `parseValidatorFindings` returns null

#### Scenario: No findings
- **WHEN** the text is `{"findings": []}`
- **THEN** `parseValidatorFindings` returns an empty list

### Requirement: Validator tree guard
Before spawning the validator, `runValidator` SHALL record `vcs.status()` and
the contents of every file it lists. After the spawn, it SHALL put back every
path the validator changed, apart from files under the change's
`.run/validator/` and its `.run/events/validator.jsonl`. A path listed before
the spawn gets its recorded contents back, or is removed when it did not
exist then. Any other path goes through `vcs.discard`. The event's `restored`
SHALL list those paths, project-relative and sorted. The findings SHALL still
be read and recorded.

#### Scenario: Validator edits the tree
- **WHEN** the validator's adapter modifies a committed source file, edits a living spec the archive already changed, creates `notes.txt`, and writes a valid findings file
- **THEN** afterwards the source file matches HEAD, the living spec holds the archive's text, `notes.txt` is gone, `restored` lists those three paths, and the event's outcome is `validated`

### Requirement: Verify output logs
Every `verify_ran` event that the shared verify gate
(`runVerificationGateResult` with an event context) or a sync
(`runSyncVerify`) appends SHALL have a `log`: the path, relative to the
change folder, of a file written before the event that holds the run's whole
output as the shared verification runner returned it. Its `output` SHALL be
the tail "Event output tail" defines, present only when that tail is not
blank. The gate's result SHALL carry the same `log`.

#### Scenario: Log written for a failing verify
- **WHEN** task 1's verify prints 100 lines and fails
- **THEN** `.run/logs/1-1.log` holds all 100 lines, and the `verify_ran` event's `log` is `.run/logs/1-1.log` and its `output` holds lines 61 through 100

#### Scenario: Blank output
- **WHEN** a verify prints nothing
- **THEN** its log file exists and is empty, and its `verify_ran` event has a `log` and no `output`

#### Scenario: Sync verify log
- **WHEN** a sync runs a task's verify that prints 100 lines and passes
- **THEN** the `verify_ran` event the sync appends to `change.jsonl` has a `log` naming a `.run/logs/change-<n>.log` file that holds all 100 lines, an `output` with lines 61 through 100, and the sync commit holds no file under `.run/logs/`

### Requirement: Verify log files
`writeVerifyLog` in `src/core/run/verify-log.ts` SHALL write every verify log
to `.run/logs/<target>-<n>.log` in the change folder. `<target>` is the event
stream's target: the task number, or `change`. `<n>` is one more than the
number of `<target>-<k>.log` files already there, so the first run of task 1
writes `.run/logs/1-1.log` and the next `.run/logs/1-2.log`. A blank output
SHALL still get its file.

#### Scenario: Next run of the same target
- **WHEN** task 1's verify runs again after `.run/logs/1-1.log` exists
- **THEN** it writes `.run/logs/1-2.log` and leaves `.run/logs/1-1.log` unchanged

### Requirement: Verify logs ignored by git
Before it writes the first log in a change folder, `writeVerifyLog` SHALL
create `.run/logs/.gitignore` holding the line `*`, so git ignores every file
in that folder, the ignore file included. No dead task's patch, verified or
dead task's commit, sync commit, clean-tree check or land SHALL carry a log
file.

#### Scenario: Logs ignored by git
- **WHEN** a verify log is written in a git worktree
- **THEN** `.run/logs/.gitignore` holds `*` and `git status --porcelain --untracked-files=all` lists nothing under `.run/logs/`

### Requirement: Event output tail
`tailVerifyOutput` in `src/core/run/verify-excerpt.ts` SHALL build every
event output tail. A text of at most `limits.markerOutputLines` lines, none
longer than `limits.markerLineChars` characters, SHALL be kept exactly,
trailing newline included. Any other text, after trailing whitespace is
trimmed, SHALL keep its last `limits.markerOutputLines` lines, each line
longer than `limits.markerLineChars` cut as "Verify output excerpt in
markers" cuts it. A blank text SHALL become the empty string.

#### Scenario: Short output kept exactly
- **WHEN** a recorded output is `before red after\n`
- **THEN** the event's `output` is `before red after\n`

#### Scenario: Long output cut to its tail
- **WHEN** a recorded output is 100 numbered lines and `limits.markerOutputLines` is 40
- **THEN** the event's `output` is lines 61 through 100

#### Scenario: Long line cut in a tail
- **WHEN** a kept line is 1,000 characters long and `limits.markerLineChars` is 400
- **THEN** the event's `output` holds its first 400 characters followed by `… (600 more characters)`

### Requirement: Events that keep a tail
The `output` of `verify_ran`, `regressed` and `recertification` events, and
the body of a halt's `.run/regressed/change.md`, SHALL be the "Event output
tail" of the text they record. That covers the scope audit's `regressed`
event and the automatic recertification it triggers, `osq retry`'s
recertification, and every halt `haltWorktreeChange` writes. A requeued
recertification's prior failure context for the next executor is that tail.

#### Scenario: Halt detail cut
- **WHEN** a change halts with a 1,000-line detail
- **THEN** its `.run/regressed/change.md` body and its `regressed` event's `output` hold the last 40 lines

#### Scenario: Configured tail length
- **WHEN** `limits.markerOutputLines` is 5 and a change halts with a 1,000-line detail
- **THEN** its `regressed` event's `output` holds the last 5 lines

#### Scenario: Scope audit tails
- **WHEN** a scope audit re-runs a done task's verify and it prints 100 lines
- **THEN** the `regressed` or automatic `recertification` event it records holds lines 61 through 100

#### Scenario: Human recertification tail
- **WHEN** `osq retry` recertifies a scope-regressed task whose verify prints 100 lines and fails
- **THEN** its `recertification` event records `outcome: requeued` and an `output` of lines 61 through 100

### Requirement: Commit failure catch-up
A verified-task or dead-task commit that fails SHALL halt the change with
reason `commit_failed` and git's output as the detail. Each cycle, for a
change in a git worktree, after the reaper and before the automatic-retry
step, the watcher SHALL catch up on its records through
`catchUpWorktreeCommits` in `src/watcher/commit-catch-up.ts`:

1. When `.run/regressed/change.md` exists with a reason other than
   `commit_failed`, it SHALL do nothing.
2. When it exists with reason `commit_failed`, it SHALL count the `regressed`
   events with reason `commit_failed` in `.run/events/change.jsonl` after the
   last `retry` event for target `change` that has no `automatic` key. When
   that count is more than `gates.commitRetries`, it SHALL do nothing more
   and the change stays halted.
3. It SHALL commit, in task order, every task whose `.run/dead/<n>.md` status
   lists as untracked or added, through "Dead task record" with the reason in
   that marker's frontmatter.
4. After a `commit_failed` halt and successful dead commits, it SHALL clear
   the halt through `retrySpec` with target `change` and `{ automatic: true }`,
   and log `↻ change of <id> caught up after commit_failed`.

A failed dead commit in step 3 SHALL halt again with `commit_failed`. After
the halt clears, the cycle goes on as for a change that never halted, so
"Verified task commit" makes any pending verified commit, and a failure there
halts again with `commit_failed`. A human `osq retry <id> change` grants a new
budget.

#### Scenario: Dead commit caught up
- **WHEN** a task in a worktree dies with `verify_red`, its dead commit fails on a `pre-commit` hook that prints `blocked by hook`, the hook is removed, and a watcher cycle runs
- **THEN** the branch gains `osq: <id> task <n> dead, reason verify_red`, the worktree is clean outside the change folder, `.run/regressed/change.md` is gone and `.run/regressed/change.1.md` holds `blocked by hook`, and `.run/events/change.jsonl` ends with a `retry` event whose target is `change`, reason `commit_failed`, and `automatic` true

#### Scenario: Verified commit caught up
- **WHEN** the `pre-commit` hook rejects a passing task's commit, the hook is removed, and a watcher cycle runs with no `osq retry`
- **THEN** the cycle commits `osq: <id> task <n> verified` and spawns the next task

#### Scenario: Record left undone
- **WHEN** a task's `.run/dead/<n>.md` exists, untracked, with the agent's edits still in the worktree and no halt, and a watcher cycle runs
- **THEN** the cycle commits the dead record before the automatic-retry step, and no `worktree_dirty` halt is written

#### Scenario: Budget spent
- **WHEN** the `pre-commit` hook keeps rejecting, `gates.commitRetries` is 2, and five watcher cycles run after the first `commit_failed` halt
- **THEN** `.run/events/change.jsonl` holds exactly three `regressed` events with reason `commit_failed` and the branch tip is unchanged

#### Scenario: Retry after the hook is fixed
- **WHEN** the budget is spent, the hook is fixed, and a human runs `osq retry <id> change`
- **THEN** the next cycle commits the task as `osq: <id> task <n> verified` and then spawns the next task

#### Scenario: Other halts left alone
- **WHEN** `.run/regressed/change.md` has reason `worktree_dirty`
- **THEN** the catch-up commits nothing and writes no event

### Requirement: Watch state files
osq SHALL keep a project's watcher records under
`<home>/.osq/watch/<sha256 of the project root's real path>/`, the folder
`watchStateDir` in `src/core/run/watch-state.ts` returns. The folder SHALL
hold `service.json`, written by `osq watch --background` for the supervisor;
`watcher.json`, written by a continuous watcher for itself; and `watch.log`,
the service's log. `service.json` SHALL hold `pid`, ISO `startedAt` and
`log`, the log's absolute path. `watcher.json` SHALL hold `pid`, `mode`
(`background` for a service worker, `terminal` otherwise), `version`,
`commit`, ISO `startedAt`, and `waiting`, null or the reason the watcher
waits. `readWatchState` SHALL return each record only when its file parses
and its `pid` is alive, and null otherwise; a process counts as alive when
`process.kill(pid, 0)` succeeds or fails with `EPERM`. `removeWatchRecord`
SHALL delete a record only when its `pid` is the given pid. Nothing in a
change folder or the project tree SHALL be written for these records.

#### Scenario: Live and dead records
- **WHEN** `service.json` names a live pid and `watcher.json` names a pid that is not running
- **THEN** `readWatchState` returns the service record, a null watcher, and the log path

#### Scenario: Record of another process kept
- **WHEN** `removeWatchRecord` runs for `watcher.json` with a pid other than the one the file holds
- **THEN** the file is unchanged

#### Scenario: One folder per project
- **WHEN** two project roots are read with the same home
- **THEN** their state folders differ, and a symlink to a root resolves to that root's folder

### Requirement: Service worker build checks
A watcher started with a `buildCheck` SHALL use it in place of the stale
build checks: before every cycle and at each point where the stale check
runs today, before the step that picks up a pending task and at the top of
the archive step. `createServiceBuildCheck` in `src/watcher/service-build.ts`
SHALL read the build key, the `version` in the package root's
`package.json` and the newest mtime under its `dist/`, once when it is
created, and on each call compare the current key with it:

| Current key | Newest `dist/` file | `src/` newer than `dist/` | Outcome |
|---|---|---|---|
| changed | at least `watch.buildSettleSeconds` old | any | `BuildChangedError` |
| changed | younger | any | wait: `a new osq build is being written` |
| unchanged | any | yes | wait: the stale line |
| unchanged | any | no | pass |

A wait SHALL throw `BuildWaitError` with the reason. A `BuildWaitError` SHALL
skip the rest of that cycle without stopping the loop, spawning a task,
archiving, or writing a marker, commit or event, and the next cycle checks
again. The check SHALL log the reason once each time the reason changes, set
`waiting` in `watcher.json` to it, and set `waiting` back to null on the next
pass. A `BuildChangedError` SHALL stop the loop the way a stale build stops it
today, without printing the stale line, and exit with `EXIT_NEW_BUILD`, 75.
Both errors SHALL extend `StaleBuildError`, so `runWatcherCycle` rethrows
them. A watcher without a `buildCheck` SHALL behave as before.

#### Scenario: Rebuilt while idle
- **WHEN** a watcher with a build check has no pending task, and `dist/` gets a file whose mtime is older than `watch.buildSettleSeconds`
- **THEN** the next cycle exits with 75 and no change folder gains a file

#### Scenario: Build still being written
- **WHEN** `dist/` gets a file with the current time and `watch.buildSettleSeconds` is 10
- **THEN** the watcher spawns no task, does not exit, and `waiting` is `a new osq build is being written`

#### Scenario: Source newer than the build
- **WHEN** a watcher with a build check has a pending task and `src/` is newer than `dist/`
- **THEN** the adapter's spawn is never called, the watcher does not exit, `waiting` holds the stale line, and the line is logged once over three cycles

#### Scenario: Rebuilt during a task
- **WHEN** `dist/` gets a settled newer file while the adapter's spawn for task 1 of a two-task change runs
- **THEN** `.run/done/1` exists, task 2 is never spawned, and the watcher exits with 75

#### Scenario: Wait clears
- **WHEN** a watcher waited on the stale line and `src/` is then no newer than `dist/` as read at start
- **THEN** the next cycle spawns the pending task and `waiting` is null

### Requirement: Watch service supervisor
`runServiceSupervisor` in `src/watcher/service.ts` SHALL run the watcher as a
child process: the same Node executable, its `execArgv`, and the `osq` entry
it was started with, running `watch` with the forwarded flags and
`OSQ_WATCH_ROLE=worker`, its stdout and stderr appended to `watch.log`. Before
each spawn, when `watch.log` is larger than `watch.logMaxBytes`, it SHALL
rename it to `watch.log.1`, replacing any older one. It SHALL append its own
lines to `watch.log` with an ISO timestamp. When the worker exits:

- after a stop request, it SHALL remove `service.json` and exit 0;
- with `EXIT_NEW_BUILD`, it SHALL log `new osq build; restarting the watcher`
  and spawn a new worker at once;
- otherwise, it SHALL log `watcher exited with <code or signal>; restarting
  in <n>s` and spawn a new worker after `n` seconds. `n` starts at
  `watch.restartDelaySeconds` and doubles after each such exit, up to
  `watch.restartMaxDelaySeconds`. It goes back to the start after a worker
  that ran longer than `watch.restartMaxDelaySeconds` or exited with
  `EXIT_NEW_BUILD`.

On SIGTERM or SIGINT it SHALL send SIGINT to a running worker, so the worker
finishes its running task first, and spawn no other worker; with no worker
running it SHALL cancel a pending restart, remove `service.json`, and exit 0.
The supervisor never builds osq and never runs git.

#### Scenario: Crash backoff
- **WHEN** with `restartDelaySeconds` 5 and `restartMaxDelaySeconds` 15, four workers in a row exit with code 1 after one second each
- **THEN** the restarts wait these delays:

| Exit | Delay before the next worker |
|---|---|
| 1 | 5 s |
| 2 | 10 s |
| 3 | 15 s |
| 4 | 15 s |

#### Scenario: Healthy run resets the backoff
- **WHEN** a worker exits with code 1 after running longer than `restartMaxDelaySeconds`, following two quick crashes
- **THEN** the next worker starts after `restartDelaySeconds`

#### Scenario: New build
- **WHEN** a worker exits with 75
- **THEN** a new worker spawns with no delay and the log holds `new osq build; restarting the watcher`

#### Scenario: Stop while a task runs
- **WHEN** the supervisor receives SIGTERM while a worker runs
- **THEN** the worker receives SIGINT, no other worker spawns after it exits, `service.json` is removed, and the supervisor exits 0

#### Scenario: Stop during a restart delay
- **WHEN** the supervisor receives SIGTERM while it waits to restart a crashed worker
- **THEN** no worker spawns, `service.json` is removed, and the supervisor exits 0

#### Scenario: Log rotation
- **WHEN** `watch.log` is larger than `watch.logMaxBytes` before a spawn
- **THEN** its content moves to `watch.log.1` and the new worker writes to a fresh `watch.log`

### Requirement: Failing test files in verify output
`readFailingTestFiles` in `src/core/run/failing-tests.ts` SHALL read the
failing test files a verify run's output names. It SHALL look only at the lines
after the last line that starts with `✖ failing tests:` after leading
whitespace, and read each line of the form `test at <path>:<line>:<column>`,
after leading whitespace, as `<path>`. A `<path>` given as a `file://` URL or
as an absolute path SHALL be read relative to the project root, as a POSIX
path. The result SHALL be the distinct paths, sorted, or null when the output
has no such section or the section names no file.

#### Scenario: Paths read from the failing-tests section
- **WHEN** a run's output, from project root `/repo`, holds the line `✖ failing tests:` followed by each line below
- **THEN** each line reads as the path shown

| line after `✖ failing tests:` | read as |
| --- | --- |
| `test at tests/inbox.test.ts:2:14782` | `tests/inbox.test.ts` |
| `test at file:///repo/tests/report.test.ts:1:1966` | `tests/report.test.ts` |
| `test at /repo/tests/watch.test.ts:7:7902` | `tests/watch.test.ts` |
| `✖ reads the inbox (3148.737208ms)` | nothing |
| `    at TestContext.<anonymous> (tests/inbox.test.ts:571:14)` | nothing |

#### Scenario: No failing-tests section
- **WHEN** a run's output has no line starting with `✖ failing tests:`, or that section has no `test at` line
- **THEN** `readFailingTestFiles` returns null

#### Scenario: Lines before the section are ignored
- **WHEN** a `test at tests/early.test.ts:1:1` line comes before the last `✖ failing tests:` line, and only `test at tests/late.test.ts:1:1` follows it
- **THEN** the result is `["tests/late.test.ts"]`

### Requirement: Change verify rerun after unrelated failures
When the change-level verify fails after a task's verify passed, the runner
SHALL decide whether the failures are unrelated to the task. They are
unrelated only when the run did not time out, `readFailingTestFiles` reads at
least one failing test file from its output, and every failing test file:

- is under `tests/` and existed with the same content in the test snapshot
  the runner took before the agent spawned,
- is not in the task's resolved scope, and
- imports no existing file in the task's resolved scope, at any depth of the
  relative import graph `buildImportGraph` builds with the OpenSpec root
  left out.

When the failures are unrelated and fewer than `gates.changeVerifyReruns`
reruns have been spent at this task boundary, the runner SHALL run the
change-level verify again, recording its `verify_ran` event as every
change-level run does. It SHALL then append one `change_verify_rerun` event to
the task's own stream, `.run/events/<n>.jsonl`, with data
`{ rerun, tests, passed }`: `rerun` is the 1-based rerun number, `tests` the
failing test files of the run it repeats, and `passed` whether the rerun
passed. A rerun that fails is judged again by the same rule before the next
rerun.

A passing rerun SHALL let the task reach done exactly as if the first run had
passed. Otherwise the task SHALL die with `change_verify_red` as before, with
its dead marker built from the last run. The task's own verify, the baseline,
and the archive-time verifies are never rerun.

#### Scenario: Unrelated failure passes on rerun
- **WHEN** the change-level verify first fails naming only `tests/other.test.ts`, a preexisting test the agent left unchanged that imports nothing in the task's scope, and passes when run again
- **THEN** the task reaches done, the task's stream holds one `change_verify_rerun` event with `{ rerun: 1, tests: ["tests/other.test.ts"], passed: true }`, and the change stream holds two change-level `verify_ran` events

#### Scenario: Rerun fails too
- **WHEN** the change-level verify fails twice naming only `tests/other.test.ts`, under the default `gates.changeVerifyReruns` of 1
- **THEN** the task dies with `change_verify_red`, its dead marker holds the second run's excerpt, and the task's stream holds one `change_verify_rerun` event with `passed: false`

#### Scenario: Failures that touch the task
- **WHEN** the change-level verify fails once with each condition below
- **THEN** the runner reruns it or not as shown

| condition | rerun |
| --- | --- |
| the failing test is preexisting, unchanged, outside scope, and imports nothing in scope | yes |
| the failing test imports a scoped file through another file | no |
| the failing test is in the task's scope | no |
| the agent created the failing test | no |
| the agent changed the failing test | no |
| the failing test is outside `tests/` | no |
| one of two failing tests imports a scoped file | no |
| the output names no failing test | no |
| the run timed out | no |

#### Scenario: No rerun leaves today's behavior
- **WHEN** the runner does not rerun a failing change-level verify
- **THEN** the task dies with `change_verify_red`, the change stream holds one change-level `verify_ran` event for this boundary, and the task's stream holds no `change_verify_rerun` event

#### Scenario: Reruns turned off
- **WHEN** `gates.changeVerifyReruns` is 0 and the change-level verify fails naming only an unrelated test
- **THEN** the task dies with `change_verify_red` without a rerun

#### Scenario: Two reruns
- **WHEN** `gates.changeVerifyReruns` is 2 and the change-level verify fails twice naming only `tests/other.test.ts`, then passes
- **THEN** the task reaches done and its stream holds two `change_verify_rerun` events, `{ rerun: 1, passed: false }` and `{ rerun: 2, passed: true }`, each with `tests: ["tests/other.test.ts"]`

### Requirement: Format before verify
When `gates.formatCommand` is set, the watcher SHALL format a task's changed
files after the agent exits and before the focused run and the task's verify:
after the `## Blocked`, denied-dependency, and missing-verify-path checks pass.
The changed files SHALL be the paths in the task's resolved scope that exist
now and whose content differs from the snapshot osq took of the scope before
the agent spawned, sorted. A file outside the task's scope SHALL never be
passed. With no changed file, or no command, nothing runs and nothing is
recorded.

The command SHALL run once, with `{files}` replaced by the changed files,
each single-quoted and separated by spaces, through `runVerificationCommand`
with the verify role, the task's change folder, and `verifyTimeoutSeconds`.
osq SHALL append one `format_ran` event to the task's stream with data
`{ command, files, exitCode, duration, timedOut, output }`: the resolved
command, the files, the run's result, and the output tail
`tailVerifyOutput` keeps, present only when not blank.

A failing or timed-out format command SHALL NOT end the attempt: the watcher
logs one warning naming the exit code and goes on, and verify decides. What
the command writes is part of the task's work: the focused run, the verify,
the change-level verify, the done marker's scope hashes, the `measures` end
event, and, in a worktree, the task's commit all see the formatted files.

#### Scenario: Changed scoped files are formatted
- **WHEN** a task's scope is `src/a.ts`, `src/b.ts` and `src/c.ts`, the agent changes `src/a.ts`, creates `src/b.ts`, and leaves `src/c.ts`, and `gates.formatCommand` is `node fmt.cjs {files}`
- **THEN** the command runs as `node fmt.cjs 'src/a.ts' 'src/b.ts'`, one `format_ran` event records `files: ["src/a.ts", "src/b.ts"]` and `exitCode: 0`, `src/c.ts` is unchanged, and the task's verify sees the formatted content

#### Scenario: Files the command may not get
- **WHEN** the agent deletes scoped `src/old.ts` and creates `tests/new.test.ts` outside the scope, besides changing scoped `src/a.ts`
- **THEN** the command gets only `'src/a.ts'`

#### Scenario: Done marker holds the formatted hashes
- **WHEN** the format command rewrites `src/a.ts` and the task's verify passes
- **THEN** the done marker's scope hash for `src/a.ts` is the hash of the formatted content, so the next scope audit finds no change

#### Scenario: Failing format command
- **WHEN** the format command exits 1 and the task's verify passes
- **THEN** the `format_ran` event records `exitCode: 1`, the watcher logged one warning, and the task reaches done

#### Scenario: Nothing to format
- **WHEN** `gates.formatCommand` is unset, or the agent changed no scoped file
- **THEN** no format command runs and the task's stream holds no `format_ran` event

#### Scenario: Blocked task
- **WHEN** the agent writes `## Blocked` in its result
- **THEN** the task dies with `blocked` and no format command runs

### Requirement: Approval notices in the manifest
An approval's `.run/manifest.json` SHALL record `notices`, the approval
digest's notices record `{ items, opened }`, next to `approvalFlags`. A
planning-only manifest SHALL omit it, and an approval whose digest carries no
notices record SHALL omit it too.

#### Scenario: Notices recorded at approval
- **WHEN** `osq approve` seals a change with one red and one grey notice and no opened list
- **THEN** the manifest's `notices.items` lists both with their severity and `folded: false`, and `notices.opened` is null

#### Scenario: Planning manifest
- **WHEN** `osq plan` writes a manifest
- **THEN** it has no `notices`

### Requirement: Server state files
The folder `watchStateDir` returns SHALL also hold `server.json`, written by
`osq server start` for the server's supervisor, and `server.log`, the
server's log. `server.json` SHALL hold `pid`, ISO `startedAt`, `log`, the
log's absolute path, and `url`, the server's URL. `readServerRecord`,
exported from `src/core/run/watch-state.ts`, SHALL return the record only when the file
parses and its `pid` is alive, and null otherwise, judged as
`readWatchState` judges its records. `writeServerRecord` SHALL write it as
the other records are written. `removeWatchRecord` and
`removeWatchRecordSync` SHALL accept `server` and delete `server.json` only
when it names the given pid. `readWatchState`'s result SHALL not change.

#### Scenario: Live and dead server records
- **WHEN** `server.json` names a live pid, and later a pid that is not running
- **THEN** `readServerRecord` first returns the record and then null, and `readWatchState` returns the same service and watcher records both times

#### Scenario: Server record of another process kept
- **WHEN** `removeWatchRecord` runs for `server` with a pid other than the one `server.json` holds
- **THEN** the file is unchanged

### Requirement: Server supervisor
`runServiceSupervisor` SHALL take an optional `service`, `watch` or
`server`, defaulting to `watch`. With `watch` it SHALL behave exactly as
"Watch service supervisor" says. With `server` it SHALL behave the same way
with these differences:

| | `watch` | `server` |
|---|---|---|
| Worker arguments after the entry | `watch` and the forwarded flags | `server start` |
| Worker role variable | `OSQ_WATCH_ROLE=worker` | `OSQ_SERVER_ROLE=worker` |
| Log and rotated log | `watch.log`, `watch.log.1` | `server.log`, `server.log.1` |
| Record removed on stop | `service.json` | `server.json` |
| Line on a new build | `new osq build; restarting the watcher` | `new osq build; restarting the server` |
| Line after a crash | `watcher exited with <code or signal>; restarting in <n>s` | `server exited with <code or signal>; restarting in <n>s` |

The restart delays, the log size limit and the stop handling SHALL come
from `config.watch` for both. `SERVER_ROLE_ENV`, `OSQ_SERVER_ROLE`, SHALL be
exported beside `WATCH_ROLE_ENV`. The supervisor never builds osq and never
runs git.

#### Scenario: Server worker spawn
- **WHEN** `runServiceSupervisor` runs with `service: 'server'` and an injected spawn
- **THEN** the worker spec's args end with `server start`, its env holds `OSQ_SERVER_ROLE=worker`, and its log path ends with `server.log`

#### Scenario: Server new build
- **WHEN** a server worker exits with 75
- **THEN** a new worker spawns with no delay and `server.log` holds `new osq build; restarting the server`

#### Scenario: Server stop
- **WHEN** the server supervisor receives SIGTERM while its worker runs
- **THEN** the worker receives SIGINT, no other worker spawns after it exits, `server.json` is removed, and `service.json` is untouched

#### Scenario: Watch service unchanged
- **WHEN** `runServiceSupervisor` runs without `service`
- **THEN** it spawns `watch` with `OSQ_WATCH_ROLE=worker` and writes `watch.log`, as before

### Requirement: Emptied capability removed
`applyOpenSpecDeltas`, which archive and the land sync's
`rebuildLivingSpecs` both call, SHALL merge each delta through
`mergeLivingSpec(baseContent, capability, delta)`. That function returns the
text `mergeDelta` returns, or null when that text has no requirement. On
null, it SHALL remove `<openspecRoot>/specs/<capability>/spec.md` and
`osq.yml`, then the folder when it is empty, and write nothing for that
capability. `restoreArchiveSpecs` SHALL put both files back from the archive
record after a red or interrupted change-level verify, as it does for any
other capability the change writes.

#### Scenario: Last requirement removed
- **WHEN** a change whose delta removes both requirements of `gadgets`, which has `spec.md` and `osq.yml`, archives through `applyArchiveSpecs`
- **THEN** `openspec/specs/gadgets/` does not exist

#### Scenario: Restored after a red verify
- **WHEN** `restoreArchiveSpecs` runs for that change
- **THEN** `openspec/specs/gadgets/spec.md` and `osq.yml` hold their bytes from before the archive

#### Scenario: Some requirements left
- **WHEN** a delta removes one of the two requirements of `gadgets`
- **THEN** `openspec/specs/gadgets/spec.md` holds the other requirement and `osq.yml` is unchanged
