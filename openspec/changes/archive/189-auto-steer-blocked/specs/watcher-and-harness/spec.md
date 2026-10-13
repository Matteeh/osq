## ADDED Requirements

### Requirement: Automatic steering run
`runWatcherCycle` and `runWatcherOnce` SHALL take an optional last argument,
`AutoSteerOptions` `{ steeringPrompt?, plannerAdapter? }` from
`src/watcher/auto-steer.ts`, and `startWatcher` SHALL pass its own
`steeringPrompt` option in it. For each active change whose derived state has
`steering` after the automatic-retry step, `runWatcherCycle` SHALL call
`runAutoSteer(projectRoot, change, state, config, options)` and then leave the
change alone for the rest of the pass, as it does today.

`runAutoSteer` SHALL run nothing, write nothing, and return null when
`autoSteer.enabled` is not true, no `steeringPrompt` was given, the change is
not approved, any trigger is one `isDefaultBranchTrigger` accepts, or
`.run/auto-steer.md` holds a record whose key is the change's current steering
key (a `running` one is handled as "Automatic steering record" says).
Otherwise it SHALL:

1. Build the prompt with `steeringPrompt(projectRoot, config, id)`. A null
   prompt runs nothing. A thrown error spawns nothing: it is written as a
   `failed` record whose body is the error's message, with an
   `auto_steer_ran` event, and the watcher pass goes on.
2. Record the tree as the validator guard's `snapshotValidatorTree` does, and
   the content of every file in the change folder outside `.run/`. Then write a
   `running` record with the key.
3. Spawn the planner once through `adapter.spawn`. The adapter is
   `plannerAdapter` when given, else `getHarnessAdapter` for the harness
   `resolvePlannerSelection(config)` selects. The options are `projectRoot`
   set to the change's tree root, `specFolderPath` set to the change folder,
   `taskNumber` `planner`, `taskTitle` `Steering planner`, an empty
   `verifyCommand`, `scope`, `entry` and `skills`, `tier` `smart`,
   `timeoutSeconds` from `autoSteer.timeoutSeconds`, `config` from
   `plannerRunConfig(config)`, and `prompt` set to the built prompt.
4. Put back every path the planner changed, as the validator guard does,
   except paths inside the change folder outside `.run/`, the change's
   `.run/events/planner.jsonl`, and its `.run/auto-steer.md`.
5. List the change-folder-relative POSIX paths outside `.run/` that were
   added, changed, or removed since step 2, sorted, as `changed`.
6. Decide the outcome: `failed` when the spawn threw or exited non-zero,
   `timed_out` when it timed out, `unchanged` when `changed` is empty, else
   `ready` when `lintChangeFolder(projectRoot, folderPath, config)` is valid
   and `lint_red` when it is not.
7. Write the record, append one change-level `auto_steer_ran` event with
   `{ outcome, harness, model, duration, exitCode, triggers, changed, restored }`
   and `output` for a failure or lint errors, where `triggers` holds each
   trigger's `describeTrigger` text and `restored` the project-relative paths
   step 4 put back, sorted. Then log `spec <id> automatic planner <outcome>`.

It SHALL return the outcome. The planner's edits inside the change folder
SHALL stay whatever the outcome. The run SHALL never write `.run/approved`,
retire a trigger, run a task, or commit.

#### Scenario: Blocked task gets a revised plan
- **WHEN** `autoSteer.enabled` is on, approved change 001 runs in its worktree with task 1 done and task 2 dead with `reason: blocked`, and the planner rewrites `tasks/2.md`, writes `src/out.txt`, and writes the change's `.run/approved`
- **THEN** the planner spawned once in the worktree with `taskNumber` `planner` and the built prompt, `src/out.txt` and `.run/approved` hold their bytes from before the spawn, `tasks/2.md` keeps the planner's edit, `.run/auto-steer.md` records outcome `ready` with `changed` `["tasks/2.md"]`, and the last `auto_steer_ran` event has outcome `ready` and `restored` `["openspec/changes/001-order-flow/.run/approved", "src/out.txt"]`

#### Scenario: One run per trigger
- **WHEN** the watcher runs another pass over that change without a new approval or trigger
- **THEN** the planner is not spawned again, no second `auto_steer_ran` event is written, and no task runs

#### Scenario: Approval after a revised plan
- **WHEN** `osq approve 001` runs after the `ready` outcome and the watcher runs a pass
- **THEN** task 2 runs again

#### Scenario: Off by default
- **WHEN** the config has no `autoSteer` block and a task of an approved change is dead with `reason: blocked`
- **THEN** the planner is not spawned and the change has no `.run/auto-steer.md`

#### Scenario: Default-branch trigger waits for a human
- **WHEN** `autoSteer.enabled` is on and an approved change has task 2 dead with `reason: blocked` and `.run/regressed/change.md` with `reason: sync_conflict`
- **THEN** the planner is not spawned and the change has no `.run/auto-steer.md`

#### Scenario: Planner outcomes
- **WHEN** with `autoSteer.enabled` on and task 2 dead with `reason: blocked`, the planner does each of the following
- **THEN** `.run/auto-steer.md` records the outcome, and task 2's dead marker stays

| planner | outcome |
|---|---|
| exits 1 | `failed` |
| returns `timedOut: true` | `timed_out` |
| exits 0 without an edit | `unchanged` |
| exits 0 after setting `tasks/2.md`'s verify to `node -e "process.exit(0)"` | `lint_red` |

#### Scenario: Prompt cannot be built
- **WHEN** with `autoSteer.enabled` on and task 2 dead with `reason: blocked`, `steeringPrompt` throws `ENOENT: brief.md`
- **THEN** the planner is not spawned, the watcher pass completes, and `.run/auto-steer.md` records outcome `failed` with a body that holds `ENOENT: brief.md`

### Requirement: Automatic steering record
`src/core/run/auto-steer-record.ts` SHALL own `.run/auto-steer.md` in a
change folder (`autoSteerRecordPath`). Its frontmatter SHALL hold `key`,
`outcome` (one of `running`, `ready`, `unchanged`, `lint_red`, `failed`,
`timed_out`, the `AutoSteerOutcome` type), `changed` (a list of paths) and
`at` (an ISO time), and its body the failure output or the lint errors, one
`- <error>` line each. `readAutoSteerRecord(folderPath)` SHALL return null for
a missing or malformed file, and `writeAutoSteerRecord(folderPath, record)`
SHALL write it.

`steeringKey(folderPath, approvedHash, triggers)` SHALL be `sha256:` and the
hex SHA-256 over the approved hash and, for each trigger in order, its
`describeTrigger` text and the bytes of `steeringMarkerPath(folderPath,
trigger)`. `currentAutoSteer(state)` SHALL return the record only when the
state is approved, has `steering`, and the record's key equals the state's
current key; otherwise null.

When `runAutoSteer` finds a `running` record with the current key, the
earlier run did not finish. It SHALL rewrite that record as `failed` with the
body `interrupted: the watcher stopped during the run`, spawn nothing, and
return `failed`.

#### Scenario: Key follows the trigger
- **WHEN** `steeringKey` is computed for a change twice with nothing changed, then after task 2's dead marker is rewritten with other bytes, then after the approved hash changes
- **THEN** the first two keys are equal, and each later key differs from the one before it

#### Scenario: Stale record
- **WHEN** `.run/auto-steer.md` holds a `ready` record whose key was computed for an earlier dead marker of task 2
- **THEN** `currentAutoSteer` returns null

#### Scenario: Interrupted run
- **WHEN** `.run/auto-steer.md` holds a `running` record with the current key and the watcher runs a pass with `autoSteer.enabled` on
- **THEN** the planner is not spawned and the record's outcome is `failed` with body `interrupted: the watcher stopped during the run`
