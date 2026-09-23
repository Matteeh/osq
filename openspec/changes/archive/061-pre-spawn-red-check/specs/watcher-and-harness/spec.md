# Spec Delta: Watcher and Harness

## ADDED Requirements

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
<!-- source: src/watcher/task-verify.ts, src/watcher/verify.ts, src/harness/types.ts, tests/pre-spawn-verify.test.ts -->
The pre-spawn run SHALL append one `verify_ran` event through the single
watcher verification entrypoint, adding `phase: "pre_spawn"`, `expected` (the
task's `verify_starts`), and a boolean `mismatch`. A mismatch SHALL be a pass
when `red` is expected or a failure or timeout when `green` is expected; `any`
never mismatches. Under `warn` a mismatch SHALL log one warning and continue;
under `fail` it SHALL kill the task with `verify_precondition`.

#### Scenario: Green start under warn
- **WHEN** a task expecting `red` starts its first attempt, its verify passes, and `gates.preSpawnVerify` is `warn`
- **THEN** the pre-spawn event records `mismatch: true`, the logger receives one warning naming the task, and the task proceeds through its normal gates

#### Scenario: Green start under fail
- **WHEN** a task expecting `red` starts its first attempt, its verify passes, and `gates.preSpawnVerify` is `fail`
- **THEN** the task dies with `verify_precondition`, the agent never spawns, and no `started` event is written

#### Scenario: Declared green start
- **WHEN** a task declaring `verify_starts: green` starts its first attempt and its verify passes
- **THEN** the pre-spawn event records `mismatch: false`

## MODIFIED Requirements

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
