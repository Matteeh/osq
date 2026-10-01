## ADDED Requirements

### Requirement: Steering triggers
A change needs steering when one of a fixed list of triggers is active. The
list SHALL be exactly these, and adding a trigger SHALL be a change to this
requirement:

- `stuck`: a task whose active `.run/dead/<n>.md` has `stuck: true`.
- `blocked`: a task whose active `.run/dead/<n>.md` has `reason: blocked`.
- `regression`: a task with an active `.run/regressed/<n>.md`, whatever its
  reason, or an active `.run/regressed/change.md` whose reason is
  `verify_red` or `verify_path_missing`.

`deriveSteering(snapshot)` in `src/core/status/steering.ts` SHALL return,
without reading anything beyond the `ChangeFolderSnapshot`, one
`{ target, trigger, reason }` per active trigger of an approved change, where
`target` is `change` or the task number and `reason` is the marker's `reason`.
The change-level trigger SHALL come first, then tasks in numeric order. An
unapproved change, a dead task with a done marker, and a change-level
regression with any other reason, such as `worktree_dirty` or `sync_conflict`,
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

### Requirement: Steering inbox items
A change whose derived state has `steering` SHALL have exactly one needs-you
item and at most one dispatch item. The needs-you item SHALL be the halt item
of its first trigger's target (`change-regressed` for `change`, else
`task-dead` or `task-regressed` for that task), with command `osq plan <id>`
and `steering: { trigger, reason }` from that trigger; for a `blocked` trigger
it SHALL also carry `blocked: { need }` as "Blocked inbox items" says. Every
other halt item of that change SHALL be left out. Its text row SHALL be
`<row> — needs steering: <trigger> (<reason>) — osq plan <id>`, where `<row>`
is the task row for a task target and `  <id>: <title>` for the change target,
and a blocked trigger adds `: <need>` after `(<reason>)`, with whitespace in the
need collapsed to single spaces. In `osq inbox`, the item's card SHALL print
`  needs steering: <describeTrigger>` on the line after `  why:`.

#### Scenario: One item for a change with two triggers
- **WHEN** an approved change has a `verify_red` change regression and a stuck task 2
- **THEN** `osq --json` holds one needs-you item for it, a `change-regressed` item with `steering: { trigger: "regression", reason: "verify_red" }` and command `osq plan <id>`, and no item for task 2

#### Scenario: Stuck task row
- **WHEN** task 1 of change 002, titled `First dead`, is stuck with reason `verify_red`
- **THEN** its text row is `  002: <title> — task 1: First dead — needs steering: stuck (verify_red) — osq plan 002`

#### Scenario: Steering card
- **WHEN** `osq inbox` prints the card of a change whose task 3 is blocked
- **THEN** the card's line after `  why:` is `  needs steering: task 3 blocked (blocked)`

## MODIFIED Requirements

### Requirement: Human attention inbox projection
The system SHALL derive a human attention inbox with deterministic `needsYou`,
`running`, and `landed` groups. Active attention and running entries SHALL be
projected from the existing status/state snapshot rather than independent
marker reads.

`needsYou` SHALL contain unapproved active changes with `proposal.md`, active
dead and regressed tasks, and active change-level regressions, except that a
change that needs steering contributes the one item "Steering inbox items"
names. `running` SHALL
contain only derived running tasks whose parsed lock PID is currently live,
with PID, lock start time, and non-negative elapsed seconds. `landed` SHALL use
only valid typed `archived` events as authoritative archive timestamps. Needs
and running entries SHALL sort by numeric change/task order; landed entries
SHALL sort newest first.

The inbox integration fixture SHALL create ignored runtime lock directories
before injecting live lock markers so the suite runs from tracked files in a
clean checkout without relying on empty directories or developer worktree
artifacts.

#### Scenario: Mixed attention state
- **WHEN** active changes include unapproved proposals, dead or regressed tasks, a change regression, and live and stale running locks
- **THEN** the inbox contains every attention item once, includes only the live running task, and leaves every marker unchanged

#### Scenario: Recorded archive state
- **WHEN** archived folders contain valid and malformed change-level event streams
- **THEN** only folders with a valid archived event are eligible for the landed group without filesystem-time inference

#### Scenario: Clean-checkout live-lock fixture
- **WHEN** the inbox integration suite copies only tracked fixture files and injects a live running lock
- **THEN** test setup creates the missing ignored parent directory before writing the lock and exercises the real bare CLI

### Requirement: Blocked inbox items
A `task-dead` inbox item whose task died with reason `blocked` SHALL carry
`blocked: { need }`, where `need` is the task result file's `## Blocked` text as
`parseResultSections` reads it. When the result file has no such section, `need`
SHALL be `(not stated)`. A blocked task is a steering trigger, so the item's
command SHALL be `osq plan <id>` and its text row the one "Steering inbox
items" gives:
`<task row> — needs steering: blocked (blocked): <need> — osq plan <id>`,
with whitespace in the need, line breaks included, collapsed to single spaces.
Every other `task-dead` item SHALL stay exactly as before.

#### Scenario: Blocked task in the inbox
- **WHEN** task 1 of change 001 died with `blocked` and its result file's `## Blocked` says `Needs src/b.ts in scope`
- **THEN** `osq --json` gives its `task-dead` item `blocked: { need: "Needs src/b.ts in scope" }`, `steering: { trigger: "blocked", reason: "blocked" }`, and the command `osq plan 001`, and the text row shows the need and `osq plan 001`

#### Scenario: Other dead task
- **WHEN** a task died with `verify_red`
- **THEN** its item has no `blocked` key and its command is `osq retry <id> <n>`

### Requirement: Stuck and automatic retry inspection
A dead task whose active marker has `stuck: true` SHALL derive `stuck` with its
fingerprint. A stuck task is a steering trigger, so its inbox item SHALL command
`osq plan <id>` and its text row SHALL be the one "Steering inbox items" gives.
`osq show` SHALL print `Retries: <n> (<a> automatic)` for a task with
retry events and `Stuck: same failure twice (<fingerprint>)` for a stuck task.

#### Scenario: Stuck task in the inbox
- **WHEN** a dead task's active marker has `stuck: true`, a fingerprint, and `reason: verify_red`
- **THEN** its inbox row reads `task <n>: <title> — needs steering: stuck (verify_red) — osq plan <id>`

#### Scenario: Retries in show
- **WHEN** a task's event stream has one manual and one automatic `retry` event
- **THEN** its show entry prints `Retries: 2 (1 automatic)`, and a task without retry events prints no such line

### Requirement: Stable inbox object
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, or `change-regressed`; only task kinds SHALL carry
`task: { number, title }`. A `task-dead` item for a stuck task SHALL also carry
`stuck: { fingerprint }`; no other item carries `stuck`. The one item of a
change that needs steering SHALL also carry `steering: { trigger, reason }`; no
other item carries `steering`. An approval item whose
change has steps before approval SHALL also carry `beforeApproval: true`; no
other item carries `beforeApproval`. A running item SHALL contain `change`,
`task`, numeric `pid`, ISO `startedAt`, integer non-negative `elapsedSeconds`,
and `command`. A landed item SHALL contain `change`, ISO `archivedAt`, and
`command`. A landed item whose tasks disclosed anything SHALL also carry
`disclosures: { deviated, missingContext, outsideScope }`, the number of tasks
with each real section; no other landed item carries `disclosures`. Empty
groups SHALL be empty arrays and JSON output SHALL contain no additional prose
or metadata.

#### Scenario: JSON contract projection
- **WHEN** the inbox is serialized for `osq --json`
- **THEN** its property set, discriminants, nested identities, value types, and deterministic array ordering match the stable contract

#### Scenario: Text and JSON parity
- **WHEN** text and JSON are rendered from an equivalent filesystem snapshot and clock
- **THEN** both representations contain the same ordered items, commands, elapsed values, and archive timestamps

#### Scenario: Stuck field
- **WHEN** a dead task is stuck
- **THEN** its `task-dead` item carries `stuck: { fingerprint }` and every other item's JSON is unchanged

#### Scenario: Landed change with disclosures
- **WHEN** a landed change has one task with a real `## Outside scope` section
- **THEN** its landed item carries `disclosures: { deviated: 0, missingContext: 0, outsideScope: 1 }`, its text line ends with `— disclosed: outside scope 1`, and every other landed item is unchanged

#### Scenario: Steps before approval
- **WHEN** an unapproved planned change has `### Before approval` steps
- **THEN** its approval item carries `beforeApproval: true` and every other item's JSON is unchanged

#### Scenario: Archived change with after-landing steps
- **WHEN** an archived change has `### After landing` steps and a `check` command
- **THEN** it adds no needs-you item

#### Scenario: Steering field
- **WHEN** a change needs steering because task 1 is blocked, and another change has a `verify_red` dead task that is not stuck
- **THEN** only the first change's item carries `steering`, and the second change's item has the keys `kind`, `change`, `task`, and `command`

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
  `osq land <id>` and `osq show <id>`. With `vcs.enabled` off and `GitVcs`,
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

### Requirement: Card keys
`cardKeys(item)` SHALL map each of the item's commands to keys, in the
item's command order:

- `osq approve <id>`: `a`.
- `osq plan <id>`: `p`.
- `osq retry <id> <target>`: `r`.
- `osq reject <id> --reason <text>`: `x`, which asks `Reason: `; its
  arguments are `reject <id> --reason` and the answer.
- `osq show <id>`: `s`.

Each key SHALL carry its label (the command, or the command with
`--reason <text>` for reject) and its argument list without the leading
`osq`. A command that does not start with `osq `, or whose verb is not in
this list, SHALL be returned among `manual` commands, unchanged.

`formatCardScreen(total, item, card, keys)` SHALL return `Needs you (<total>):`,
then the card as `osq inbox` prints it up to but not including `Actions:`,
then `Keys:` with one `  <key>  <label>` line per key followed by
`  n  skip` and `  q  quit`, then, when there are manual commands,
`Run yourself:` with one `  <command>` line each. `dispatch-text.ts` SHALL
export `formatDispatchCardBody(item, card)`, the card lines before
`Actions:`, and `osq inbox` SHALL print what it printed before.

#### Scenario: Approval keys
- **WHEN** `cardKeys` runs on an approval item
- **THEN** it returns `a` with arguments `approve <id>` and `s` with `show <id>`, and no manual commands

#### Scenario: Change halt keys
- **WHEN** `cardKeys` runs on a change-level halt item
- **THEN** it returns `r`, `x` asking `Reason: `, and `s`

#### Scenario: Verify keys
- **WHEN** `cardKeys` runs on an item whose commands are `osq check 012`, `osq verified 012 --passed|--failed`, and `osq show 012`
- **THEN** it returns only `s`, and both other commands are manual

#### Scenario: Land in a worktree
- **WHEN** `cardKeys` runs on a land item archived in a worktree
- **THEN** `osq land <id>` is a manual command and `s` is the only key

#### Scenario: Screen
- **WHEN** `formatCardScreen` formats an approval item's card
- **THEN** it holds `Needs you (<n>):`, the card body without `Actions:`, and `Keys:` with `a`, `s`, `n`, and `q` lines

#### Scenario: Steering keys
- **WHEN** `cardKeys` runs on a halt item of a change that needs steering
- **THEN** it returns `p` with arguments `plan <id>` and `s` with `show <id>`, and no manual commands

### Requirement: Next step commands
The command SHALL be `osq plan <id>` for `unplanned` with `brief.md`, else
`osq lint <id>`; `osq approve <id>`; `osq show <id>` for `running`;
`osq plan <id>` for `dead` when the change's derived state has `steering`;
otherwise `osq retry <id> <n>` for the first dead or regressed task, else
`osq retry <id> change`; `osq show <dep>` for the first unmet
dependency; and null for `landed`.

#### Scenario: Blocked change
- **WHEN** an approved change depends on 012, which is not landed
- **THEN** its next step is `blocked` with command `osq show 012` and detail `waiting for 012`

#### Scenario: Change regression next step
- **WHEN** approved change 007 has `.run/regressed/change.md` with `reason: worktree_dirty` and no dead or regressed task
- **THEN** its next step is `dead` with command `osq retry 007 change`

#### Scenario: Steering next step
- **WHEN** approved change 007 has a stuck task 2
- **THEN** its next step is `dead` with command `osq plan 007` and detail `needs steering`

### Requirement: Next step detail and format
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, `needs steering` for a `dead` change whose derived state has
`steering`, and null otherwise. `formatNextStep` SHALL render the state with
spaces for hyphens, then ` (<detail>)` when set, then ` — <command>` when set.

#### Scenario: Failed verification
- **WHEN** an archived change's latest `verification_recorded` outcome is `failed`
- **THEN** `formatNextStep` renders `landed`

#### Scenario: Steering format
- **WHEN** change 007 needs steering
- **THEN** `formatNextStep` renders `dead (needs steering) — osq plan 007`
