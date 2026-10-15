## ADDED Requirements

### Requirement: Planner run record
`src/core/run/plan-run-record.ts` SHALL own `.run/plan-run.md` in a change
folder (`planRunRecordPath`), the record of a planner a human started for a
change that is not approved. Its frontmatter SHALL hold `outcome` (an
`AutoSteerOutcome`), `changed` (a list of paths), `at` (an ISO time: the start
while `running`, else the end), `pid` (a number, while `running`) and `hash`
(a string, once finished), and its body the failure output or the lint
errors. `readPlanRunRecord(folderPath)` SHALL return null for a missing or
malformed file, and `writePlanRunRecord(folderPath, record)` SHALL write it,
leaving out `pid` and `hash` when they are not set.

`currentPlanRun(state)` takes an `AutoSteerState` and SHALL return
`{ outcome, at, changed, detail }`, with `detail` the body or null, or null:

- for an approved state with `steering`, from `currentAutoSteer(state)`;
- for a state that is not approved, from `.run/plan-run.md`, where a finished
  record counts only while its `hash` equals `hashChangeFolder` of the folder;
- null for any other state or a missing record.

A `running` record whose `pid` is missing or for which `isProcessAlive`
returns false SHALL be returned as `failed` with detail
`interrupted: the planner process stopped`. `readLivePlanner(state)` SHALL
return `{ since }`, the record's `at`, when `currentPlanRun(state)` returns a
`running` outcome, else null. Nothing here writes a file.

`spawnPlanner(context, adapter)`, `decideOutcome(...)` and the `RunContext`
type SHALL live in `src/watcher/planner-spawn.ts`, and `executeRun` in
`src/watcher/auto-steer-run.ts` SHALL use them, with its behavior unchanged.

#### Scenario: Live planner
- **WHEN** an unapproved change's `.run/plan-run.md` holds a `running` record with `at` `2026-10-14T09:30:00.000Z` and the test's own pid
- **THEN** `currentPlanRun` returns outcome `running` with that `at`, and `readLivePlanner` returns `{ since: "2026-10-14T09:30:00.000Z" }`

#### Scenario: Planner process gone
- **WHEN** the record's pid belongs to a child process that has exited
- **THEN** `currentPlanRun` returns outcome `failed` with detail `interrupted: the planner process stopped`, `readLivePlanner` returns null, and the record file is unchanged

#### Scenario: Plan edited after the run
- **WHEN** the folder holds a `lint_red` record whose `hash` was taken before `tasks/1.md` changed
- **THEN** `currentPlanRun` returns null, and before that edit it returned outcome `lint_red` with the record's body as `detail`

#### Scenario: Steering run is the planner run
- **WHEN** an approved change with task 2 dead with `reason: blocked` holds a current `.run/auto-steer.md` record with outcome `ready`
- **THEN** `currentPlanRun` returns outcome `ready` with that record's `changed`

## MODIFIED Requirements

### Requirement: Automatic steering record
`src/core/run/auto-steer-record.ts` SHALL own `.run/auto-steer.md` in a
change folder (`autoSteerRecordPath`). Its frontmatter SHALL hold `key`,
`outcome` (one of `running`, `ready`, `unchanged`, `lint_red`, `failed`,
`timed_out`, the `AutoSteerOutcome` type), `changed` (a list of paths), `at`
(an ISO time) and, on a `running` record, `pid`, the process that runs the
planner, and its body the failure output or the lint errors, one
`- <error>` line each. `readAutoSteerRecord(folderPath)` SHALL return null for
a missing or malformed file, and `writeAutoSteerRecord(folderPath, record)`
SHALL write it, leaving out `pid` when it is not set. The `running` record
`executeRun` writes SHALL carry `process.pid`.

`steeringKey(folderPath, approvedHash, triggers)` SHALL be `sha256:` and the
hex SHA-256 over the approved hash and, for each trigger in order, its
`describeTrigger` text and the bytes of `steeringMarkerPath(folderPath,
trigger)`. `currentAutoSteer(state)` SHALL return the record only when the
state is approved, has `steering`, and the record's key equals the state's
current key; otherwise null.

When `runAutoSteer` finds a `running` record with the current key whose `pid`
is set and `isProcessAlive` returns true for it, another process is running
the planner: it SHALL spawn nothing, write nothing, and return null. For any
other `running` record with the current key, the earlier run did not finish.
It SHALL rewrite that record as `failed` with the body
`interrupted: the watcher stopped during the run`, spawn nothing, and return
`failed`.

#### Scenario: Key follows the trigger
- **WHEN** `steeringKey` is computed for a change twice with nothing changed, then after task 2's dead marker is rewritten with other bytes, then after the approved hash changes
- **THEN** the first two keys are equal, and each later key differs from the one before it

#### Scenario: Stale record
- **WHEN** `.run/auto-steer.md` holds a `ready` record whose key was computed for an earlier dead marker of task 2
- **THEN** `currentAutoSteer` returns null

#### Scenario: Interrupted run
- **WHEN** `.run/auto-steer.md` holds a `running` record with the current key and the watcher runs a pass with `autoSteer.enabled` on
- **THEN** the planner is not spawned and the record's outcome is `failed` with body `interrupted: the watcher stopped during the run`

#### Scenario: Planner running elsewhere
- **WHEN** `.run/auto-steer.md` holds a `running` record with the current key and the test's own pid, and the watcher runs a pass with `autoSteer.enabled` on
- **THEN** the planner is not spawned, `runAutoSteer` returns null, and the record's bytes are unchanged

#### Scenario: Running record names its process
- **WHEN** `executeRun` runs with a planner that checks the record while it runs
- **THEN** the record it reads has outcome `running` and `pid` equal to `process.pid`
