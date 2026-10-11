# Spec Delta: status-inspection

## MODIFIED Requirements

### Requirement: Steering triggers
A change needs steering when one of a fixed list of triggers is active. The
list SHALL be exactly these, and adding a trigger SHALL be a change to this
requirement:

- `stuck`: a task whose active `.run/dead/<n>.md` has `stuck: true`.
- `blocked`: a task whose active `.run/dead/<n>.md` has `reason: blocked` or
  `reason: entry_missing`.
- `regression`: a task with an active `.run/regressed/<n>.md`, whatever its
  reason, or an active `.run/regressed/change.md` whose reason is
  `verify_red`, `verify_path_missing`, or `sync_verify_red`.
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

### Requirement: Blocked inbox items
A `task-dead` inbox item whose task died with reason `blocked` SHALL carry
`blocked: { need }`, where `need` is the task result file's `## Blocked` text as
`parseResultSections` reads it. When the result file has no such section, `need`
SHALL be `(not stated)`. A `task-dead` item whose task died with reason
`entry_missing` SHALL carry `blocked: { need }` with `need` set to
`missing entry files <paths>`, the paths the dead marker lists as `- <path>`
lines, joined with `, `, or `(not stated)` when it lists none. A blocked task
is a steering trigger, so the item's
command SHALL be `osq plan <id>` and its text row the one "Steering inbox
items" gives:
`<task row> — needs steering: blocked (<reason>): <need> — osq plan <id>`,
with whitespace in the need, line breaks included, collapsed to single spaces.
Every other `task-dead` item SHALL stay exactly as before.

#### Scenario: Blocked task in the inbox
- **WHEN** task 1 of change 001 died with `blocked` and its result file's `## Blocked` says `Needs src/b.ts in scope`
- **THEN** `osq --json` gives its `task-dead` item `blocked: { need: "Needs src/b.ts in scope" }`, `steering: { trigger: "blocked", reason: "blocked" }`, and the command `osq plan 001`, and the text row shows the need and `osq plan 001`

#### Scenario: Missing entry file in the inbox
- **WHEN** task 1 of change 001 died with `entry_missing` and its dead marker lists `- src/gone.ts` and `- src/old.ts`
- **THEN** `osq --json` gives its `task-dead` item `blocked: { need: "missing entry files src/gone.ts, src/old.ts" }`, `steering: { trigger: "blocked", reason: "entry_missing" }`, and the command `osq plan 001`

#### Scenario: Other dead task
- **WHEN** a task died with `verify_red`
- **THEN** its item has no `blocked` key and its command is `osq retry <id> <n>`
