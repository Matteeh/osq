---
title: Pre-spawn red check
depends_on: []
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - cli-foundation
    - spec-lint-and-approve
    - metrics-and-reporting
    - status-inspection
---
## Goal

Before a task's first attempt, the watcher runs the task's `verify` once and
records whether it passed. A verify that is already green before any agent
touches the tree means the work is done or the verify does not exercise the
task. osq flags it.

Every executor prompt says to run verify and start from what fails, but the
watcher never checks that anything failed. New test files are unrestricted, so
a green verify after the agent exits can rest entirely on tests the same agent
wrote minutes earlier. This check is the cheapest answer to that gap, and it
collects the numbers needed to decide later whether planners should own tests.

Refactor tasks are supposed to start green, so a task declares what it expects
with `verify_starts`. A mismatch warns by default. Whether a red caused by a
missing test file is meaningful is not judged here; the output is recorded so
that question can be answered from data.

The check costs one extra verify per task on its first attempt only: about 3
seconds for a focused verify, about 26 seconds for `pnpm verify`.

`runTask` in `src/watcher/runner.ts` already runs `captureTestGate` before
spawn. The new check runs beside it and reuses `runVerificationGateResult` from
`src/watcher/verify.ts`, so the event keeps one writer. `readRetryContext` in
`src/watcher/attempt.ts` already reconstructs the attempt number from the event
stream: retries and requeued recertifications advance it past 1, and archive
verification never goes through `runTask`, so "attempt 1" is enough to keep the
check off all three.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests drive `runTask` with
local verifiers that always pass, always fail, and flip to green once the agent
has written a file, and prove the warn, fail, and off modes, the `green` and
`any` declarations, and that a retried attempt runs no pre-spawn check. Report
and show tests read hand-written event streams. No test needs a network, a TTY,
or a real model.

## Non-goals

- Judging whether a red result is meaningful, for example a missing test file.
- Changing task, change-level, scope-audit, or archive-time verification.
- A lint rule for `verify_starts`. An unrecognized value is treated as `red`.
- Showing pre-spawn results in the web dashboard.

## Surface

- Added: `verify_starts` (task frontmatter field: `red`, `green`, or `any`; default `red`)
- Added: `gates.preSpawnVerify` (config key: `warn`, `fail`, or `off`; default `warn`)
- Added: `verify_precondition` (dead reason)
- Added: `verify_ran.phase`, `verify_ran.expected`, `verify_ran.mismatch` (event fields, pre-spawn runs only)
- Added: `history.preSpawnVerify` (`osq report --json` field) and a `Pre-spawn verify mismatches:` line in `osq report`
- Added: `Pre-spawn verify:` line per task in `osq show`

## Contract

### Requirement: Pre-spawn verify check
On a task's first attempt, unless `gates.preSpawnVerify` is `off`, the runner
SHALL run the task's `verify` under `timeouts.verifyTimeoutSeconds` after the
test snapshot and before execution measures or the agent start. The run SHALL
append one `verify_ran` event carrying `phase: "pre_spawn"`, the task's
`expected` start state, and `mismatch`. A mismatch is a passing verify when
`red` is expected, or a failing or timed-out verify when `green` is expected; a
task expecting `any` never mismatches. With `warn` a mismatch logs one warning
and the task continues. With `fail` a mismatch kills the task with
`verify_precondition` before spawn. Attempts after the first SHALL NOT run the
check.

#### Scenario: Red start as expected
- **WHEN** a task expecting `red` starts its first attempt and verify fails
- **THEN** a pre-spawn `verify_ran` with `mismatch: false` is recorded and the agent spawns

#### Scenario: Green start warns
- **WHEN** a task expecting `red` starts its first attempt, verify passes, and the mode is `warn`
- **THEN** the event records `mismatch: true`, one warning names the task, and the agent spawns

#### Scenario: Green start fails
- **WHEN** the same mismatch occurs with mode `fail`
- **THEN** the task dies with `verify_precondition`, and no `started` event is written

#### Scenario: Retry skips the check
- **WHEN** a task runs as attempt 2 or later
- **THEN** no pre-spawn `verify_ran` is recorded for that attempt

### Requirement: Pre-spawn visibility
`osq report` SHALL count pre-spawn runs and mismatches apart from verification
runs, and `osq show` SHALL print each task's latest pre-spawn result.

#### Scenario: Report
- **WHEN** task streams hold two pre-spawn runs, one a mismatch
- **THEN** `history.preSpawnVerify` reports 2 runs and 1 mismatch naming that task, and verification-run totals exclude both

## Human steps

- Review the proposal, delta specs, and task bodies, then run
  `osq approve 061` yourself.

## Delta

- `specs/watcher-and-harness/spec.md`: adds "Pre-spawn verify check"; modifies "Dead letter recording and failure handling" for `verify_precondition`.
- `specs/cli-foundation/spec.md`: modifies "Configuration loading and schema validation" for `gates.preSpawnVerify`.
- `specs/spec-lint-and-approve/spec.md`: modifies "Change folder structure and parsing" for `verify_starts`.
- `specs/metrics-and-reporting/spec.md`: modifies "Execution history" for the pre-spawn count.
- `specs/status-inspection/spec.md`: modifies "Detailed specification inspection" for the show line.

No file is shared between tasks.
