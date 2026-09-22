# Spec Delta: Watcher and Harness

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts, src/core/manifest.ts, src/core/scope.ts, src/core/scope-hash.ts, src/core/verification.ts, tests/retry*.test.ts, tests/reject.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, deterministic task-scope resolution and hashing, shared
verification execution, agent harnesses, adapter registration, execution
manifest construction, and append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, scope, verification, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/lock.ts`, `src/core/manifest.ts`, `src/core/scope.ts`, `src/core/scope-hash.ts`, `src/core/verification.ts`, `tests/retry*.test.ts`, and `tests/reject.test.ts` to watcher-and-harness

### Requirement: Scope recertification audit
<!-- source: src/core/scope.ts, src/core/scope-hash.ts, src/core/verification.ts, src/watcher/regression.ts, src/watcher/loop.ts, src/harness/types.ts, tests/scope-recertification.test.ts, tests/scope-resolver-upgrade.test.ts -->
Before locking an upcoming task, the watcher SHALL compare every earlier
automated done task's recorded resolver-aware scope hash and resolver version
with the current tree in one audit. Every stale task SHALL run its own verify
command under the configured verify timeout, then receive an active regression
marker and typed regression event containing sorted differing paths,
verification command and result, recorded and current scope hashes, resolver
upgrade context, and per-path attribution whether verification passed or
failed.

A differing path SHALL be attributed to a later done task only when exactly one
later task's normalized file-change events name a resolver-produced path and
the current file hash agrees with that task's resolver-produced completion hash
when available. Multiple qualifying tasks SHALL be `ambiguous`; absence of a
trustworthy candidate SHALL be `unknown`.

An active regression marker SHALL make later audits idempotent. Any newly stale
task SHALL return `blocked_by_regression` without locking, running, counting, or
writing failure state for the upcoming task. Logging SHALL contain one
stale-task line followed by one numerically ordered change summary.

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

### Requirement: Done marker scope hash frontmatter
<!-- source: src/watcher/outcome.ts, src/core/scope.ts, src/core/scope-hash.ts, src/core/retry.ts -->
The engine SHALL record YAML frontmatter in `.run/done/<n>` markers comprising
`scope_resolver: 2`, the post-task aggregate hash over resolved scope files,
per-file scope hashes, active build stamp, and verification exit code. Human
recertification SHALL preserve completion and build metadata while retaining
the first trusted hash as `original_scope_hash`, refreshing `scope_hash` and
`scope_files`, recording resolver version 2 and `recertified_at`, and
incrementing `recertification_count`.

#### Scenario: Done marker frontmatter emission
- **WHEN** a task successfully verifies and finishes
- **THEN** `.run/done/<n>` contains `scope_resolver: 2`, `scope_hash`, `scope_files`, `build_stamp`, and `exit_code: 0`, followed by the ISO completion timestamp

#### Scenario: Passing recertification
- **WHEN** human retry verification passes for a scope-regressed task
- **THEN** canonical done metadata retains its original completion and build values, preserves the first original hash, and records resolver-2 current hashes plus recertification time and count

#### Scenario: Scope hash stability across task completions
- **WHEN** equivalent exact and glob declarations are fingerprinted at completion or recertification
- **THEN** the aggregate hash derives deterministically from sorted resolved project-relative paths and their UTF-8 SHA-256 content digests

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
