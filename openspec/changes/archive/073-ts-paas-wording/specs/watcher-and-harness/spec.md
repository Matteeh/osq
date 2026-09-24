# Spec Delta: Watcher and Harness

## MODIFIED Requirements

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
