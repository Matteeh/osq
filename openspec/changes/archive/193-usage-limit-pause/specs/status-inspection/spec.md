## ADDED Requirements

### Requirement: Paused task in the inbox
`readInbox` SHALL add one running item for each approved active change whose
`readActivePause` returns a pause naming one of its task numbers. The item is
`{ change: { id, title }, task: { number, title }, pausedUntil, command }`,
where `pausedUntil` is the pause's `until` and `command` is `osq show <id>`.
These items SHALL be sorted with the live running items by numeric change and
task order. `formatInboxText` SHALL render one as
`  <id>: <title> — task <n>: <task title> — paused until <time> — osq show <id>`,
with `<time>` from `formatPauseUntil`. A pause whose `until` has passed SHALL add
no item.

#### Scenario: Paused task
- **WHEN** approved change `007` titled `Pricing` has pending task 2 titled `Prices`, and its `.run/paused.md` holds task `2` until `2099-01-01T09:30:00.000Z`
- **THEN** `osq --json` holds the running item `{ change: { id: "007", title: "Pricing" }, task: { number: "2", title: "Prices" }, pausedUntil: "2099-01-01T09:30:00.000Z", command: "osq show 007" }`, and the text row under `Running` is `  007: Pricing — task 2: Prices — paused until 2099-01-01 09:30 UTC — osq show 007`

#### Scenario: No item for a passed pause
- **WHEN** the change's `.run/paused.md` holds task `2` until `2000-01-01T00:00:00.000Z`
- **THEN** the inbox has no running item for the change

## MODIFIED Requirements

### Requirement: Stable inbox object
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, `change-regressed`, `change-archived`,
`after-land-failed`, or `validator-failing`; only task kinds
SHALL carry `task: { number, title }`. A `task-dead` item for a stuck task SHALL also carry
`stuck: { fingerprint }`; no other item carries `stuck`. The one item of a
change that needs steering SHALL also carry `steering: { trigger, reason }`; no
other item carries `steering`. An approval item whose
change has steps before approval SHALL also carry `beforeApproval: true`; no
other item carries `beforeApproval`. A `validator-failing` item SHALL also
carry `validatorFailing: { outcome, runs, error }`; no other item carries
`validatorFailing`. A running item SHALL contain `change`, `task`, and
`command`. A live running item SHALL also contain numeric `pid`, ISO
`startedAt`, and integer non-negative `elapsedSeconds`. A paused running item
SHALL instead contain ISO `pausedUntil`, as "Paused task in the inbox" says.
No running item SHALL carry both. A landed item SHALL contain `change`, ISO `archivedAt`, and
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

#### Scenario: Paused running item keys
- **WHEN** one change has a task running under a live lock and another change has a paused task
- **THEN** the live item has the keys `change`, `task`, `pid`, `startedAt`, `elapsedSeconds` and `command`, and the paused item has the keys `change`, `task`, `pausedUntil` and `command`

### Requirement: Next step detail and format
`detail` SHALL be `do the steps before approval first` for a
`ready-for-approval` change with steps before approval, `waiting for <ids>` for
`blocked`, `needs steering` for a `dead` change whose derived state has
`steering`, `not landed` for `archived`, `paused until <time>` for a `running`
change whose `readActivePause` returns a pause, with `<time>` from
`formatPauseUntil`, and null otherwise. `formatNextStep`
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

#### Scenario: Paused format
- **WHEN** approved change 007 has a pending task and its `.run/paused.md` holds task `1` until `2099-01-01T09:30:00.000Z`
- **THEN** `formatNextStep` renders `running (paused until 2099-01-01 09:30 UTC) — osq show 007`, `osq show 007` prints `Next: running (paused until 2099-01-01 09:30 UTC) — osq show 007`, and `osq status` prints `  next: running (paused until 2099-01-01 09:30 UTC) — osq show 007` under the change

#### Scenario: Passed pause format
- **WHEN** the same change's `.run/paused.md` holds until `2000-01-01T00:00:00.000Z`
- **THEN** `formatNextStep` renders `running — osq show 007`
