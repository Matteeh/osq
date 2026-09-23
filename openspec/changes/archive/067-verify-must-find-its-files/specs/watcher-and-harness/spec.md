# Spec Delta: Watcher and Harness

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Pre-spawn verify event and mismatch handling
<!-- source: src/watcher/task-verify.ts, src/watcher/verify.ts, src/harness/types.ts, tests/pre-spawn-verify.test.ts, tests/verify-path-missing.test.ts -->
The pre-spawn run SHALL append one `verify_ran` event through the single
watcher verification entrypoint, adding `phase: "pre_spawn"`, `expected` (the
task's `verify_starts`), `missingPaths` (the named paths absent before spawn,
only when any is), and a boolean `mismatch`. A mismatch SHALL be a pass when `red` is expected and
no named path is missing, or a failure or timeout when `green` is expected; `any`
never mismatches. Under `warn` a mismatch SHALL log one warning and continue;
under `fail` it SHALL kill the task with `verify_precondition`.

#### Scenario: Green start under warn
- **WHEN** a task expecting `red` starts its first attempt, its verify passes, no named path is missing, and `gates.preSpawnVerify` is `warn`
- **THEN** the pre-spawn event records `mismatch: true`, the logger receives one warning naming the task, and the task proceeds through its normal gates

#### Scenario: Green start under fail
- **WHEN** a task expecting `red` starts its first attempt, its verify passes, no named path is missing, and `gates.preSpawnVerify` is `fail`
- **THEN** the task dies with `verify_precondition`, the agent never spawns, and no `started` event is written

#### Scenario: Declared green start
- **WHEN** a task declaring `verify_starts: green` starts its first attempt and its verify passes
- **THEN** the pre-spawn event records `mismatch: false`

#### Scenario: Green only because the new test is missing
- **WHEN** a task expecting `red` names a missing test file next to an existing one and its verify passes before spawn
- **THEN** the pre-spawn event records that file in `missingPaths` and `mismatch: false`

### Requirement: Automatic retry
<!-- source: src/watcher/auto-retry.ts, src/watcher/loop.ts, src/core/lifecycle/retry.ts, tests/auto-retry.test.ts, tests/verify-path-missing.test.ts -->
Each cycle, for every dead task in an approved change, the watcher SHALL retry
the task through `retrySpec` with `automatic: true` when its dead reason is
eligible, it is not stuck, and it has fewer automatic retries than
`gates.autoRetries` since the later of the manifest's `approvedAt` and its last
manual retry. Eligible reasons SHALL be `verify_red`, `change_verify_red`,
`undeclared_test_change`, `verify_path_missing`, `no_result`, `crashed`, and
`timeout`.

#### Scenario: Retry fixes the task
- **WHEN** a task dies with `verify_red` and passes on its next attempt
- **THEN** it reaches done with exactly one `retry` event carrying `automatic: true`, and the watcher printed one automatic-retry line

#### Scenario: Missing verify path is retried
- **WHEN** a task dies with `verify_path_missing`
- **THEN** it is retried automatically once and the next attempt's prompt contains the missing path

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

### Requirement: Archive-time verification re-run
<!-- source: src/watcher/archiver.ts, src/watcher/archive-verify.ts, src/watcher/verify.ts, tests/archive-verification.test.ts, tests/plan-prompt-lifecycle.test.ts, tests/archive-verify-path-missing.test.ts -->
Before archiving, the watcher SHALL re-run every task verification and the
change-level verification against the final tree after scope recertification.
A command naming a missing path SHALL be recorded as a regression with reason
`verify_path_missing` without running. When all gates pass, it SHALL delete
root-level `plan-prompt.md`, apply deltas, relocate the folder, project
completed checkboxes, and record the archive event. The transient prompt SHALL
not participate in any archive tree hash.

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
- **THEN** that task gets a regressed marker with reason `verify_path_missing` listing the path, the command does not run, and the change stays unarchived
