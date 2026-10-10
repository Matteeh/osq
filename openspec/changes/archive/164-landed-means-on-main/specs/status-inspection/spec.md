## MODIFIED Requirements

### Requirement: Change next step
`readNextStep(projectRoot, folderPath, config)` SHALL return `{ state,
command, detail }` for an active or archived change. Unapproved, it SHALL be
`unplanned` when its verify is missing or the placeholder, else
`ready-for-approval`. Approved, it SHALL be `dead` for a dead or regressed task
or change, `blocked` for unmet dependencies, else `running`. Archived, it SHALL
be `dead` when its derived state has `steering`, else as "Landed next step
reads the default branch" says.

#### Scenario: Fresh template
- **WHEN** a change created by `osq plan` still has the placeholder verify
- **THEN** its next step is `unplanned` with command `osq plan <id>`

#### Scenario: Plain archived change
- **WHEN** an archived change's `archived` event carries `verification: { afterLanding: true, check: null }` and no `verification_recorded` event follows
- **THEN** its next step is `landed` with a null command

#### Scenario: Archived change that needs steering
- **WHEN** change 007 archived in its worktree and `osq land 007` recorded a `sync_conflict` stop on its branch
- **THEN** its next step is `dead` with command `osq plan 007` and detail `needs steering`

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

### Requirement: Next step detail and format
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, `needs steering` for a `dead` change whose derived state has
`steering`, `not landed` for `archived`, and null otherwise. `formatNextStep`
SHALL render the state with spaces for hyphens, then ` (<detail>)` when set,
then ` — <command>` when set.

#### Scenario: Failed verification
- **WHEN** an archived change's latest `verification_recorded` outcome is `failed`
- **THEN** `formatNextStep` renders `landed`

#### Scenario: Steering format
- **WHEN** change 007 needs steering
- **THEN** `formatNextStep` renders `dead (needs steering) — osq plan 007`

#### Scenario: Not landed format
- **WHEN** change 007 is archived and the default branch does not hold it
- **THEN** `formatNextStep` renders `archived (not landed) — osq land 007`, and `osq show 007` prints `Next: archived (not landed) — osq land 007`

### Requirement: Explicit status with next steps
`osq status` SHALL keep its task table, archive count, and rejected group, and
print `  next: <next step>` under each active change. It SHALL NOT print a
`Verification pending:` section. It SHALL NOT read or advance last-look state.
It SHALL list archived changes that have not landed as "Changes waiting to land
in status" says.

#### Scenario: Full status with next steps
- **WHEN** a user executes `osq status` with an unplanned change and an archived change that has `### After landing` steps
- **THEN** the change's line is followed by `  next: unplanned — osq plan <id>`, the output has no `Verification pending:` line, and no last-look cursor is mutated

### Requirement: Brief queue state projection
Queue state SHALL be derived afresh from `queue_item` and `queue_hash` metadata
in active, archived, and rejected change briefs plus canonical task markers.
Unrelated folders SHALL not associate by name alone.

An archived association SHALL derive as landed, whatever its proposal's human
steps and whatever its `archived` event carries, except that with
`vcs.enabled` and the git port it SHALL derive as `archived` when
`readDependencyState` does not read its folder as `landed`. An active
association SHALL derive as dead for dead or regressed state, running for
running state, approved for any other approved state, and planned when
unapproved. Rejected history without an active or archived association SHALL
derive as rejected; no association SHALL derive as unplanned. Rows SHALL
include the selected change id, all retained rejection attempts, unmet queue
dependencies, and a changed since planned annotation when the selected
association's recorded section hash does not equal the current section hash.

Only a landed archived queue association SHALL satisfy a queue dependency. An
`archived` association, rejected, done-but-unarchived, manually name-matched,
and missing associations SHALL not land an item. Ambiguous multiple active or
archived associations SHALL be reported rather than silently selected. The
queue projection's `landedCount` and the queue report's `landed` count SHALL
count only `landed` rows.

#### Scenario: Mixed queue lifecycle
- **WHEN** current queue items have active, archived, rejected, and absent associations
- **THEN** every item receives one deterministic state plus change, rejection, dependency, and drift details

#### Scenario: Queue section changes after planning
- **WHEN** a current raw section hash differs from its associated brief's `queue_hash`
- **THEN** inspection reports changed since planned without rewriting or changing the state of the associated change

#### Scenario: Verification pending queue dependency
- **WHEN** queue item `beta` depends on `alpha`, whose archived change has `### After landing` steps and an `archived` event that carries `verification`, as archives before change 125 do
- **THEN** `alpha` shows as `landed`, `beta` lists no unmet dependency, and `osq plan --next` may select `beta`

#### Scenario: Archived queue item not on the default branch
- **WHEN** with `vcs.enabled`, queue item `alpha` is associated with change 007, archived in its worktree on `osq/007-alpha`, `main` does not hold it, and queue item `beta` depends on `alpha`
- **THEN** `osq queue` prints `alpha` with `[archived] change: 007`, `beta` lists `unmet: alpha`, the projection's `landedCount` does not count `alpha`, and `osq plan --next` does not select `beta`

#### Scenario: Archived queue item on the default branch
- **WHEN** the same project after `osq/007-alpha` merged into `main`
- **THEN** `osq queue` prints `alpha` with `[landed] change: 007` and `beta` lists no unmet dependency

### Requirement: Human attention inbox projection
The system SHALL derive a human attention inbox with deterministic `needsYou`,
`running`, and `landed` groups. Active attention and running entries SHALL be
projected from the existing status/state snapshot rather than independent
marker reads.

`needsYou` SHALL contain unapproved active changes with `proposal.md`, active
dead and regressed tasks, active change-level regressions, and one
`change-archived` item with command `osq land <id>` for each entry of the
status snapshot's `notLanded`, except that a change that needs steering
contributes the one item "Steering inbox items" names. `running` SHALL
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

#### Scenario: Archived change waiting to land
- **WHEN** with `vcs.enabled`, change 007 `Pricing` archived in its worktree, `main` does not hold it, and it needs no steering
- **THEN** `osq --json` holds one needs-you item `{ kind: "change-archived", change: { id: "007", title: "Pricing" }, task: null, command: "osq land 007" }`, and its text row under `Needs you` is `  007: Pricing — archived, not landed — osq land 007`

### Requirement: Stable inbox object
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, `change-regressed`, or `change-archived`; only task kinds
SHALL carry `task: { number, title }`. A `task-dead` item for a stuck task SHALL also carry
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

## ADDED Requirements

### Requirement: Landed next step reads the default branch
For an archived change that needs no steering, when `vcs.enabled` is true and
the version-control port is git, `readNextStep` SHALL return `landed` only when
`readDependencyState` reads the change's folder as `landed`, and `archived`
for any other state. Without `vcs.enabled`, or without git, it SHALL return
`landed` and read nothing from git.

#### Scenario: Archived change the default branch does not hold
- **WHEN** with `vcs.enabled`, change 007 archived in its worktree on branch `osq/007-pricing`, and `main` does not hold `openspec/changes/archive/007-pricing`
- **THEN** its next step is `archived` with command `osq land 007` and detail `not landed`

#### Scenario: Archived change the default branch holds
- **WHEN** with `vcs.enabled`, `main` holds `openspec/changes/archive/007-pricing` after `osq/007-pricing` merged into it
- **THEN** its next step is `landed` with a null command

#### Scenario: Archived change without version control
- **WHEN** `vcs.enabled` is not set and the project is a git repository whose default branch does not hold archived change 007
- **THEN** its next step is `landed` with a null command

### Requirement: Changes waiting to land in status
With `vcs.enabled`, `getStatusOverview` SHALL hold, in numeric order, each
`findLandCandidates` change whose `readNextStep` state is `archived` as
`notLanded: [{ id, folderName, title }]`, with the proposal title or the
folder name. It SHALL omit an empty `notLanded`, and without `vcs.enabled`
call neither function. `osq status` SHALL print, after `Archived specs: <n>`,
`Not landed:` and one `  <id>: <title> — osq land <id>` line per entry.

#### Scenario: Archived changes that have not landed
- **WHEN** with `vcs.enabled`, changes 007 `Pricing` and 009 `Billing` archived in their worktrees, `main` holds neither, and change 008 archived and merged into `main`
- **THEN** `osq status` prints `Not landed:`, then `  007: Pricing — osq land 007`, then `  009: Billing — osq land 009`, directly after `Archived specs:`, and no line for 008

#### Scenario: Every archived change landed
- **WHEN** with `vcs.enabled`, every archived change is held by `main`
- **THEN** the overview has no `notLanded` key and `osq status` prints no `Not landed:` line

#### Scenario: Not landed needs steering first
- **WHEN** with `vcs.enabled`, change 007 archived in its worktree, `main` does not hold it, and `osq land 007` recorded a `sync_conflict` stop on its branch
- **THEN** `osq status` prints no `Not landed:` line for 007
