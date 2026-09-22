# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Scope recertification audit
<!-- source: src/core/scope-hash.ts, src/core/verification.ts, src/watcher/regression.ts, src/watcher/loop.ts, src/harness/types.ts, tests/scope-recertification.test.ts -->
Before locking an upcoming task, the watcher SHALL compare every earlier
automated done task's recorded literal scope hash with the current tree in one
audit. Every stale task SHALL run its own verify command under the configured
verify timeout, then receive an active regression marker and typed regression
event containing sorted differing paths, verification command and result,
recorded and current scope hashes, and per-path attribution whether
verification passed or failed.

A differing path SHALL be attributed to a later done task only when exactly one
later task's recorded file-change events name the path and the current file
hash agrees with that task's completion hash when available. Multiple
qualifying tasks SHALL be `ambiguous`; absence of a trustworthy candidate SHALL
be `unknown`.

An active regression marker SHALL make later audits idempotent. Any newly stale
task SHALL return `blocked_by_regression` without locking, running, counting,
or writing failure state for the upcoming task. Logging SHALL contain one
stale-task line followed by one numerically ordered change summary.

#### Scenario: More than one completed task is stale
- **WHEN** multiple earlier done tasks differ from their recorded literal scopes before another task is due
- **THEN** every stale task is verified and recorded in one audit while the upcoming task remains unlocked and excluded from `tasksRun`

#### Scenario: Detection verification times out
- **WHEN** a stale task's verify command exceeds `verifyTimeoutSeconds`
- **THEN** its marker and event retain the timeout result and the change halts for human recertification

#### Scenario: Halted cycle repeats
- **WHEN** another watcher cycle observes the same active scope regression markers
- **THEN** it writes no duplicate markers or events and does not re-run detection verification

#### Scenario: Later edit attribution
- **WHEN** recorded file-change and completion evidence identifies one later done task for a differing path
- **THEN** the marker and event name that task, otherwise recording `ambiguous` or `unknown` according to the evidence

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
<!-- source: src/harness/types.ts, src/core/retry.ts, src/watcher/attempt.ts, src/watcher/spawn.ts, tests/retry-recertification.test.ts -->
The lifecycle event union SHALL include a typed `recertification` event carrying
task, outcome, differing paths and attribution, verify command, exit code,
output and timeout state, recorded or original scope hash, and current scope
hash. Outcome SHALL be `passed` when human retry refreshes the trusted done
record and `requeued` when failed verification returns the task to agent work.

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

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts, src/core/manifest.ts, src/core/scope-hash.ts, src/core/verification.ts, tests/retry*.test.ts, tests/reject.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, literal scope hashing, shared verification execution, agent
harnesses, adapter registration, execution manifest construction, and
append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, verification, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/lock.ts`, `src/core/manifest.ts`, `src/core/scope-hash.ts`, `src/core/verification.ts`, `tests/retry*.test.ts`, and `tests/reject.test.ts` to watcher-and-harness

### Requirement: Emitted verify_ran event exit code and duration
<!-- source: src/core/verification.ts, src/harness/types.ts, src/watcher/verify.ts, src/watcher/runner.ts -->
The task, scope-audit, and archive verification gates SHALL execute commands
through one core process implementation that returns command, exit code,
duration, output, and timeout state. Watcher callers SHALL emit `verify_ran`
events through the single watcher verification entrypoint. Core verification
SHALL NOT import watcher or harness modules.

#### Scenario: Verified task event fields
- **WHEN** task verification succeeds
- **THEN** runner emits a `verify_ran` event containing `command`, `exitCode: 0`, wall-clock `duration`, and captured output when present

#### Scenario: Failed task event fields
- **WHEN** task verification exits with non-zero code or times out
- **THEN** runner emits a `verify_ran` event containing `command`, non-zero `exitCode`, elapsed `duration`, captured output, and timeout state

#### Scenario: Single verification event emission path
- **WHEN** watcher verification or explicit scope recertification executes a verify command
- **THEN** both use the same timeout-bounded core process implementation without violating core import isolation

### Requirement: Done marker scope hash frontmatter
<!-- source: src/watcher/outcome.ts, src/core/scope-hash.ts, src/core/retry.ts -->
The engine SHALL record YAML frontmatter in `.run/done/<n>` markers comprising
the post-task content-addressed aggregate scope hash, per-file scope hashes,
active build stamp, and verification exit code. Human recertification SHALL
preserve completion and build metadata while retaining the first trusted hash
as `original_scope_hash`, refreshing `scope_hash` and `scope_files`, recording
`recertified_at`, and incrementing `recertification_count`.

#### Scenario: Done marker frontmatter emission
- **WHEN** a task successfully verifies and finishes
- **THEN** `.run/done/<n>` contains `scope_hash`, `scope_files`, `build_stamp`, and `exit_code: 0`, followed by the ISO completion timestamp

#### Scenario: Passing recertification
- **WHEN** human retry verification passes for a scope-regressed task
- **THEN** canonical done metadata retains its original completion and build values, preserves the first original hash, and records current hashes plus recertification time and count

#### Scenario: Scope hash stability across task completions
- **WHEN** declared literal scope entries are fingerprinted at completion or recertification
- **THEN** the aggregate hash derives deterministically from sorted project-relative paths and their UTF-8 SHA-256 content digests without glob expansion

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

### Requirement: Preserving retry transition
<!-- source: src/core/retry.ts, src/core/layout.ts, src/core/scope-hash.ts, src/core/verification.ts, src/watcher/**, tests/retry*.test.ts -->
Retry SHALL be the sole transition that retires an active dead or regressed
marker. It SHALL rename rather than delete active artifacts using the next
target-wide ordinal across retained dead and regressed failures.

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

### Requirement: Retried executor context
<!-- source: src/harness/types.ts, src/harness/agy.ts, src/harness/opencode.ts, src/harness/codex-prompt.ts, src/watcher/attempt.ts, src/watcher/spawn.ts, tests/harness-prompt-injection.test.ts -->
The runner SHALL reconstruct retry and requeued-recertification context from
append-only state and pass the attempt, failure reason, and failed verification
output through shared spawn options. Every textual harness prompt SHALL render
one prior-context section containing available attempt, reason, bounded failed
output, and existing prior result. Retry SHALL NOT remove the result before
spawn.

#### Scenario: Fresh process receives retry context
- **WHEN** the watcher restarts after ordinary retry and later spawns the task
- **THEN** the executor prompt identifies the retry attempt, retained failure reason, and prior result path

#### Scenario: Fresh process receives recertification failure
- **WHEN** the watcher restarts after failed recertification and later spawns the task
- **THEN** every textual harness prompt includes its next attempt and captured verification output without relying on process memory
