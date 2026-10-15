## MODIFIED Requirements

### Requirement: Steering triggers
A change needs steering when one of a fixed list of triggers is active. The
list SHALL be exactly these, and adding a trigger SHALL be a change to this
requirement:

- `stuck`: a task whose active `.run/dead/<n>.md` has `stuck: true`.
- `blocked`: a task whose active `.run/dead/<n>.md` has `reason: blocked` or
  `reason: entry_missing`.
- `regression`: a task with an active `.run/regressed/<n>.md`, whatever its
  reason, except a `scope_regression` marker with `verification_passed: true`,
  or an active `.run/regressed/change.md` whose reason is `verify_red`,
  `verify_path_missing`, or `sync_verify_red`.

A task's `scope_regression` marker whose recorded verify passed is no trigger:
the task's own verify still holds, so `osq retry <id> <n>` recertifies it in
place and no planner is needed.
- `conflict`: an active `.run/regressed/change.md` whose reason is
  `sync_conflict`.
- `requirement_changed`: an active `.run/regressed/change.md` whose reason is
  `requirement_changed`.

The last two, and a `regression` whose reason is `sync_verify_red`, are the
default-branch triggers: the watcher's sync writes their marker for an active
change, and `osq land` commits it for an archived one. `isDefaultBranchTrigger(trigger)`
in `src/core/status/steering.ts` SHALL be true for exactly these.

`deriveSteering(snapshot)` in `src/core/status/steering.ts` SHALL return,
without reading anything beyond the `ChangeFolderSnapshot`, one
`{ target, trigger, reason }` per active trigger of an approved change, active
or archived, where
`target` is `change` or the task number and `reason` is the marker's `reason`.
The change-level trigger SHALL come first, then tasks in numeric order. An
unapproved change, a dead task with a done marker, and a change-level
regression with any other reason, such as `worktree_dirty` or `sync_failed`,
SHALL yield none. `deriveSpecState` SHALL set `steering` to that list on the
derived state only when it is not empty. `describeTrigger(trigger)` SHALL
render `task <n> <trigger> (<reason>)`, or `change <trigger> (<reason>)` for
the change target.

#### Scenario: Stuck task
- **WHEN** an approved change's task 2 has an active dead marker with `reason: verify_red` and `stuck: true`
- **THEN** `deriveSteering` returns `{ target: "2", trigger: "stuck", reason: "verify_red" }` and the derived state carries it as `steering`

#### Scenario: Blocked task
- **WHEN** a task's active dead marker has `reason: blocked`
- **THEN** it is a `blocked` trigger

#### Scenario: Missing entry file
- **WHEN** an approved change's task 2 has an active dead marker with `reason: entry_missing`
- **THEN** `deriveSteering` returns `{ target: "2", trigger: "blocked", reason: "entry_missing" }` and `describeTrigger` renders `task 2 blocked (entry_missing)`

#### Scenario: Archive regression
- **WHEN** `.run/regressed/change.md` has `reason: verify_red`
- **THEN** it is a `regression` trigger with target `change`, listed before any task trigger

#### Scenario: Not a trigger
- **WHEN** a task's active dead marker has `reason: verify_red` without `stuck`, and `.run/regressed/change.md` has `reason: worktree_dirty`
- **THEN** `deriveSteering` returns no trigger and the derived state has no `steering` key

#### Scenario: Default-branch triggers
- **WHEN** `.run/regressed/change.md` has `reason: sync_conflict`, then `reason: requirement_changed`, then `reason: sync_verify_red`
- **THEN** `deriveSteering` returns a `conflict`, a `requirement_changed`, and a `regression` trigger with target `change`, and `isDefaultBranchTrigger` is true for each

#### Scenario: Run trigger is not a default-branch trigger
- **WHEN** `.run/regressed/change.md` has `reason: verify_red`
- **THEN** `isDefaultBranchTrigger` is false for its `regression` trigger

#### Scenario: Archived change
- **WHEN** an archived folder in an osq worktree has `.run/approved` and `.run/regressed/change.md` with `reason: sync_conflict`
- **THEN** its derived state carries the `conflict` trigger as `steering`

#### Scenario: Passing scope regression
- **WHEN** an approved change's task 3 has an active `.run/regressed/3.md` with `reason: scope_regression` and `verification_passed: true`, and task 4 has none
- **THEN** `deriveSteering` returns no trigger and the derived state has no `steering` key

#### Scenario: Failing scope regression
- **WHEN** an approved change's task 3 has an active `.run/regressed/3.md` with `reason: scope_regression` and `verification_passed: false`
- **THEN** `deriveSteering` returns `{ target: "3", trigger: "regression", reason: "scope_regression" }`


### Requirement: Next step commands
The command SHALL be `osq plan <id>` for `unplanned` with `brief.md`, else
`osq lint <id>`; `osq approve <id>`; `osq show <id>` for `running`;
`osq plan <id>` for `dead` when the change's derived state has `steering`;
otherwise `osq retry <id> <n>` for the first dead or regressed task, else
`osq retry <id> change`; `osq show <dep>` for the first unmet
dependency; `osq land <id>` for `archived`; and null for `landed`.

#### Scenario: Blocked change
- **WHEN** an approved change depends on 012, which is not landed
- **THEN** its next step is `blocked` with command `osq show 012` and detail `waiting for 012`

#### Scenario: Change regression next step
- **WHEN** approved change 007 has `.run/regressed/change.md` with `reason: worktree_dirty` and no dead or regressed task
- **THEN** its next step is `dead` with command `osq retry 007 change`

#### Scenario: Steering next step
- **WHEN** approved change 007 has a stuck task 2
- **THEN** its next step is `dead` with command `osq plan 007` and detail `needs steering`

#### Scenario: Passing scope regression next step
- **WHEN** approved change 007's task 3 has an active `.run/regressed/3.md` with `reason: scope_regression` and `verification_passed: true`
- **THEN** its next step is `dead` with command `osq retry 007 3` and a null detail, `osq --json` holds one needs-you item for it, a `task-regressed` item for task 3 with command `osq retry 007 3` and no `steering`, and `readDispatchItems` gives one `halt` item for it, for task 3, with commands `osq retry 007 3` then `osq show 007` and no `steering`
