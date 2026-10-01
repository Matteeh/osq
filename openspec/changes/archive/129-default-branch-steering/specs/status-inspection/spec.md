## ADDED Requirements

### Requirement: Archived change that needs steering
`findSteeringChange(projectRoot, config, id)` in
`src/core/status/steering-change.ts` SHALL return the active change
`findChange` finds for the id; else the archived change in an osq worktree
whose folder name the id matches, as `matchesFolder` does, and whose derived
state has `steering`; else null. `listArchivedSteering(projectRoot, config)`
SHALL return, in numeric order, every archived change in an osq worktree whose
derived state has `steering`, each with its derived state. Both SHALL derive
state in the change's own tree and write nothing.

`readInbox` SHALL add to the needs-you group, for each change
`listArchivedSteering` returns, one `change-regressed` item with no task,
command `osq plan <id>`, and `steering` from its first trigger, so its text row
is the change row of "Steering inbox items".

#### Scenario: Archived change found for steering
- **WHEN** change 002 archived in its worktree with a recorded `sync_conflict` stop, and change 003 archived in its worktree with none
- **THEN** `findSteeringChange` returns 002's archived folder for `002` and null for `003`, and `listArchivedSteering` returns only 002

#### Scenario: Inbox row for an archived change
- **WHEN** change 002, titled `Orders`, archived in its worktree with a recorded `sync_conflict` stop
- **THEN** `osq --json` holds one needs-you item for it, a `change-regressed` item with `steering: { trigger: "conflict", reason: "sync_conflict" }` and command `osq plan 002`, and its text row is `  002: Orders — needs steering: conflict (sync_conflict) — osq plan 002`

## MODIFIED Requirements

### Requirement: Steering triggers
A change needs steering when one of a fixed list of triggers is active. The
list SHALL be exactly these, and adding a trigger SHALL be a change to this
requirement:

- `stuck`: a task whose active `.run/dead/<n>.md` has `stuck: true`.
- `blocked`: a task whose active `.run/dead/<n>.md` has `reason: blocked`.
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

### Requirement: Change next step
`readNextStep(projectRoot, folderPath, config)` SHALL return `{ state,
command, detail }` for an active or archived change. Unapproved, it SHALL be
`unplanned` when its verify is missing or the placeholder, else
`ready-for-approval`. Approved, it SHALL be `dead` for a dead or regressed task
or change, `blocked` for unmet dependencies, else `running`. Archived, it SHALL
be `dead` when its derived state has `steering`, else `landed`.

#### Scenario: Fresh template
- **WHEN** a change created by `osq plan` still has the placeholder verify
- **THEN** its next step is `unplanned` with command `osq plan <id>`

#### Scenario: Plain archived change
- **WHEN** an archived change's `archived` event carries `verification: { afterLanding: true, check: null }` and no `verification_recorded` event follows
- **THEN** its next step is `landed` with a null command

#### Scenario: Archived change that needs steering
- **WHEN** change 007 archived in its worktree and `osq land 007` recorded a `sync_conflict` stop on its branch
- **THEN** its next step is `dead` with command `osq plan 007` and detail `needs steering`

### Requirement: Dispatch items
`readDispatchItems(projectRoot, config)` SHALL derive, on every call and
without writing anything, the items that need a human, and a
`watcherIdle` flag. It SHALL read active changes and their next steps from
`getStatusOverview`. Each item SHALL carry its kind, the change's id, folder
name, title, and folder path, the task number and title when there is one,
and the commands osq already has for it. The items SHALL be in numeric change
order, then task order. The kinds are:

- `approval`: an active change whose next step is `ready-for-approval`,
  with commands `osq approve <id>` and `osq show <id>`.
- `halt`: one per dead or regressed task, with commands
  `osq retry <id> <n>` and `osq show <id>`; and one per change-level
  regression, with commands `osq retry <id> change`,
  `osq reject <id> --reason <text>`, and `osq show <id>`. A change whose
  derived state has `steering` SHALL instead have exactly one `halt` item,
  naming its first trigger's task when the target is a task, carrying that
  trigger as `steering`, with commands `osq plan <id>` and `osq show <id>`.
- `land`: with `vcs.enabled` and `GitVcs`, one per change archived in an
  osq worktree whose `readDependencyState` is `archived`, with commands
  `osq land <id>` and `osq show <id>`. Such a change whose derived state has
  `steering` SHALL instead have the one `halt` item a change with `steering`
  has, with no task. With `vcs.enabled` off and `GitVcs`,
  one per folder in the project root's archive directory that `Vcs` status
  lists as untracked or modified, itself or any path under it, with command
  `osq show <id>`. Under `NoVcs` there SHALL be no land items.

`watcherIdle` SHALL be true when no active change's next step is `running`.

#### Scenario: Each kind
- **WHEN** a project has an unapproved change ready for approval, an approved change with a dead task, and an archived change with `### After landing` steps and a `check` command
- **THEN** the items are an `approval` and a `halt` for that task, each with its commands, and there is no item for the archived change

#### Scenario: Unplanned draft
- **WHEN** an unapproved change still has the planning sentinel verify
- **THEN** it yields no item

#### Scenario: Items follow state
- **WHEN** the dead task's marker is removed and the approval is written
- **THEN** the next call has neither the halt nor the approval item

#### Scenario: Change regression
- **WHEN** an approved change has `.run/regressed/change.md` with `reason: worktree_dirty`
- **THEN** there is one `halt` item with no task and the `osq retry <id> change` command

#### Scenario: Uncommitted archive with the flag off
- **WHEN** `vcs.enabled` is off, the project is a git repository, and an archived folder is untracked
- **THEN** there is one `land` item for it, and none once the folder is committed

#### Scenario: Archived on its branch
- **WHEN** `vcs.enabled` is on and a change has archived in its worktree and not landed
- **THEN** there is one `land` item for it with the command `osq land <id>`, and none after `git merge --squash` and a commit put its archive on the default branch

#### Scenario: No git
- **WHEN** the project is not a git repository
- **THEN** there are no `land` items

#### Scenario: Watcher idle
- **WHEN** no approved change has work left, and then an approved change has a pending task
- **THEN** `watcherIdle` is true first and false second

#### Scenario: Steering halt
- **WHEN** an approved change has a `verify_red` change regression and a blocked task 2
- **THEN** there is exactly one `halt` item for it, with no task, `steering` of trigger `regression`, and the commands `osq plan <id>` and `osq show <id>`

#### Scenario: Archived change that needs steering
- **WHEN** `vcs.enabled` is on and `osq land <id>` recorded a `sync_conflict` stop on an archived change's branch
- **THEN** there is no `land` item for it and exactly one `halt` item, with no task, `steering` of trigger `conflict`, and the commands `osq plan <id>` and `osq show <id>`
