## MODIFIED Requirements

### Requirement: Stable inbox object
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, or `change-regressed`; only task kinds SHALL carry
`task: { number, title }`. A `task-dead` item for a stuck task SHALL also carry
`stuck: { fingerprint }`; no other item carries `stuck`. An approval item whose
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

### Requirement: Brief queue state projection
Queue state SHALL be derived afresh from `queue_item` and `queue_hash` metadata
in active, archived, and rejected change briefs plus canonical task markers.
Unrelated folders SHALL not associate by name alone.

An archived association SHALL derive as landed, whatever its proposal's human
steps and whatever its `archived` event carries. An active association SHALL
derive as dead for dead or regressed state, running for running state,
approved for any other approved state, and planned when unapproved. Rejected
history without an active or archived association SHALL derive as rejected; no
association SHALL derive as unplanned. Rows SHALL include the selected change
id, all retained rejection attempts, unmet queue dependencies, and a changed
since planned annotation when the selected association's recorded section hash
does not equal the current section hash.

Only a landed archived queue association SHALL satisfy a queue dependency.
Rejected, done-but-unarchived, manually name-matched, and missing associations
SHALL not land an item. Ambiguous multiple active or archived associations
SHALL be reported rather than silently selected.

#### Scenario: Mixed queue lifecycle
- **WHEN** current queue items have active, archived, rejected, and absent associations
- **THEN** every item receives one deterministic state plus change, rejection, dependency, and drift details

#### Scenario: Queue section changes after planning
- **WHEN** a current raw section hash differs from its associated brief's `queue_hash`
- **THEN** inspection reports changed since planned without rewriting or changing the state of the associated change

#### Scenario: Verification pending queue dependency
- **WHEN** queue item `beta` depends on `alpha`, whose archived change has `### After landing` steps and an `archived` event that carries `verification`, as archives before change 125 do
- **THEN** `alpha` shows as `landed`, `beta` lists no unmet dependency, and `osq plan --next` may select `beta`

### Requirement: Change next step
`readNextStep(projectRoot, folderPath, config)` SHALL return `{ state,
command, detail }` for an active or archived change. Unapproved, it SHALL be
`unplanned` when its verify is missing or the placeholder, else
`ready-for-approval`. Approved, it SHALL be `dead` for a dead or regressed task
or change, `blocked` for unmet dependencies, else `running`. Archived, it SHALL
be `landed`.

#### Scenario: Fresh template
- **WHEN** a change created by `osq plan` still has the placeholder verify
- **THEN** its next step is `unplanned` with command `osq plan <id>`

#### Scenario: Plain archived change
- **WHEN** an archived change's `archived` event carries `verification: { afterLanding: true, check: null }` and no `verification_recorded` event follows
- **THEN** its next step is `landed` with a null command

### Requirement: Next step commands
The command SHALL be `osq plan <id>` for `unplanned` with `brief.md`, else
`osq lint <id>`; `osq approve <id>`; `osq show <id>` for `running`;
`osq retry <id> <n>` for the first dead or regressed task, else
`osq retry <id> change`; `osq show <dep>` for the first unmet
dependency; and null for `landed`.

#### Scenario: Blocked change
- **WHEN** an approved change depends on 012, which is not landed
- **THEN** its next step is `blocked` with command `osq show 012` and detail `waiting for 012`

#### Scenario: Change regression next step
- **WHEN** approved change 007 has `.run/regressed/change.md` and no dead or regressed task
- **THEN** its next step is `dead` with command `osq retry 007 change`

### Requirement: Next step detail and format
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, and null otherwise. `formatNextStep` SHALL render the state with
spaces for hyphens, then ` (<detail>)` when set, then ` — <command>` when set.

#### Scenario: Failed verification
- **WHEN** an archived change's latest `verification_recorded` outcome is `failed`
- **THEN** `formatNextStep` renders `landed`

### Requirement: Explicit status with next steps
`osq status` SHALL keep its task table, archive count, and rejected group, and
print `  next: <next step>` under each active change. It SHALL NOT print a
`Verification pending:` section. It SHALL NOT read or advance last-look state.

#### Scenario: Full status with next steps
- **WHEN** a user executes `osq status` with an unplanned change and an archived change that has `### After landing` steps
- **THEN** the change's line is followed by `  next: unplanned — osq plan <id>`, the output has no `Verification pending:` line, and no last-look cursor is mutated

### Requirement: Show next step
`osq show <id>` SHALL print `Next: <next step>` after `Status:` for active and
archived changes, and `--json` SHALL carry `next: { state, command, detail }`.
For an archived change whose events hold `check_ran` or
`verification_recorded`, as older archives may, it SHALL print a
`Verification:` section, one line per event: a check's time, command, and exit
code, and an outcome's time, outcome, and note. `--json` SHALL carry them as
`verification`. Without such events there is neither.

#### Scenario: Archived change with an outcome
- **WHEN** `osq show 012` runs on an archived change whose events record `passed`
- **THEN** it prints `Next: landed` and a `Verification:` section with the outcome

#### Scenario: Archive without verification events
- **WHEN** `osq show 012` runs on an archived change whose events hold no `check_ran` and no `verification_recorded`
- **THEN** it prints no `Verification:` line, and `--json` has no `verification` key

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
  `osq reject <id> --reason <text>`, and `osq show <id>`.
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
- **WHEN** an approved change has `.run/regressed/change.md`
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

### Requirement: Dispatch order
`orderDispatchItems(projectRoot, config, dispatch, firstSeen)` SHALL return
the items with a `weight` and a `reason` each, in dispatch order.
`firstSeen` SHALL map `dispatchIdentity` values to dates and default to an
empty map. An item's weight SHALL be one plus the number of active changes,
in any tree, whose `depends_on` reaches the item's change directly or
through other active changes. Ids SHALL match folders as `matchesFolder`
does, and a cycle SHALL count each change once. The order SHALL be:

1. When `watcherIdle` is true, `approval` and `halt` items first.
2. Then higher weight first.
3. Then items with a first-seen time before items without one, and the
   earlier first-seen time first.
4. Then lower change id, then lower task number, with a change-level item
   before its task items.

The reason SHALL join, with `; `, `watcher idle; this gives it work` when
rule 1 applies to the item and
`holds up <weight - 1> change` or `holds up <weight - 1> changes` when the
weight is above one. When neither applies, it SHALL be
`waiting since <YYYY-MM-DD HH:MM>`, the item's first-seen time in local
time, when the item has one, and `in change order` otherwise.
The same files SHALL always give the same order.

`readDispatch(projectRoot, config, home)` and
`readDispatchQueue(projectRoot, config, home)` SHALL pass
`firstSeenTimes` of `readWaitLog(projectRoot, home)`, or an empty map when
there is no log, with `home` defaulting to `os.homedir()`.

#### Scenario: Weight orders
- **WHEN** an approval item's change has three active changes depending on it, one of them through another, and another approval item's change has none
- **THEN** the first item has weight 4 and reason `holds up 3 changes` and comes first

#### Scenario: Idle watcher
- **WHEN** `watcherIdle` is true and there is a heavy `land` item and a light `halt` item
- **THEN** the `halt` item comes first with reason `watcher idle; this gives it work`

#### Scenario: Equal items
- **WHEN** two items have the same kind group and weight
- **THEN** the lower change id comes first with reason `in change order`

#### Scenario: Dependency cycle
- **WHEN** two active changes depend on each other
- **THEN** each has weight 2

#### Scenario: First seen breaks ties
- **WHEN** two approval items have the same weight, and the wait log under the home has the higher change id first seen earlier
- **THEN** `readDispatch` with that home lists the higher change id first with reason `waiting since <YYYY-MM-DD HH:MM>` for its first-seen time

#### Scenario: Logged before unlogged
- **WHEN** only the higher change id of two equal approval items has a first-seen time
- **THEN** it comes first, and the other item's reason is `in change order`

### Requirement: Dispatch cards
`readDispatchCard(projectRoot, config, item)` SHALL return the card data
for one item:

- `approval`: the approval digest from `buildApprovalDigest`.
- `halt`: for a task, the task number and title, the dead or regressed
  reason, the number of `started` events in `.run/events/<n>.jsonl` as the
  attempt count, the last `limits.cardOutputLines` lines of the marker body,
  and the path of `.run/dead/<n>.patch` relative to the project root
  when that file exists. For a change-level regression, the reason and
  the last `limits.cardOutputLines` lines of `.run/regressed/change.md`'s
  body.
- `land`: the proposal's goal, one outcome line per task as
  `osq message` writes it, with `vcs.enabled` the message
  `buildSquashMessage` builds, or its refusal message when it refuses, the
  proposal's `check` command or null, and its `### After landing` steps,
  empty when it has none. `osq inbox` SHALL print the check as a `check:`
  line and the steps as an `after landing:` block after the squash message,
  and neither when it is null or empty.

The marker lines come from files osq already writes with paths relative
to the project root, and the card SHALL NOT add an absolute path.

#### Scenario: Approval card
- **WHEN** the card is read for an approval item
- **THEN** it holds the digest's goal, capabilities, decisions, and tasks with their scopes

#### Scenario: Halt card
- **WHEN** a task died with `verify_red` after two attempts and its marker body holds verify output
- **THEN** the card has attempt count 2, reason `verify_red`, the last lines of that output, and no string that contains the project root

#### Scenario: Halt card with a patch
- **WHEN** the dead task's change left `.run/dead/<n>.patch`
- **THEN** the card names that patch by its relative path

#### Scenario: Land card
- **WHEN** a change archived in its worktree with `vcs.enabled`
- **THEN** the card holds the goal, one outcome line per task, and the squash message with `Osq-Change` among its trailers

#### Scenario: Verify card
- **WHEN** a change with a `check` command and `### After landing` steps has archived in its worktree with `vcs.enabled`
- **THEN** its land card holds the check command and the steps, and `osq inbox` prints them after the squash message

### Requirement: Card keys
`cardKeys(item)` SHALL map each of the item's commands to keys, in the
item's command order:

- `osq approve <id>`: `a`.
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

## ADDED Requirements

### Requirement: Show after-landing notes
For an active or archived change whose proposal has `### After landing` steps,
`osq show <id>` SHALL print `After landing:` after the `Verification:`
section's place, then each line of the steps indented by two spaces, and
`--json` SHALL carry the steps' text as `afterLanding`. A change without such
steps SHALL have neither.

#### Scenario: After-landing notes
- **WHEN** `osq show 012` runs on an archived change whose `### After landing` reads `- Tell support the export moved.`
- **THEN** it prints `After landing:` followed by `  - Tell support the export moved.`, and `--json` carries that text as `afterLanding`

## REMOVED Requirements

### Requirement: Verification state
**Reason**: Nothing waits on a human's verification any more (ADR 006 decision 3), so an archived change has no verification state.
**Migration**: None. `osq show` still prints the `check_ran` and `verification_recorded` events an older archive holds.

### Requirement: Verification pending dependency
**Reason**: An archived change is landed as far as its dependents are concerned; a failed check stops the change before it archives or lands.
**Migration**: None. Dependents of an archive that was verification pending run on the next watcher pass.

### Requirement: Verification inbox items
**Reason**: There is no verification for a human to record, so there is no item for it.
**Migration**: None.
