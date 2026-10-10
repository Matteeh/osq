## ADDED Requirements

### Requirement: Failed after-land command in status and inbox
When the project's `after-land.json`, as version-control "Land runs the
after-land command" writes it, names a change, `readInbox` SHALL add one
needs-you item `{ kind: 'after-land-failed', change: { id, title }, task:
null, command: 'osq land <id>' }`, with the title from the change's proposal or
else its folder name, sorted with the other items by id. `formatInboxText`
SHALL render it as `  <id>: <title> — after-land command failed — osq land
<id>`. `osq status` SHALL print `After-land command failed for <id>: <command>
— osq land <id>` after its watcher line. Without the file, both SHALL print
what they print today. Both SHALL read the file through the injectable home
they already take.

#### Scenario: Failed after-land command waiting
- **WHEN** `after-land.json` names `007-pricing` with command `pnpm build`, and change 007 is titled `Pricing`
- **THEN** `osq --json` holds one needs-you item `{ kind: "after-land-failed", change: { id: "007", title: "Pricing" }, task: null, command: "osq land 007" }`, its text row is `  007: Pricing — after-land command failed — osq land 007`, and `osq status` prints `After-land command failed for 007: pnpm build — osq land 007`

#### Scenario: No failure recorded
- **WHEN** no `after-land.json` exists
- **THEN** the inbox has no `after-land-failed` item and `osq status` prints no `After-land command failed` line

## MODIFIED Requirements

### Requirement: Stable inbox object
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `planning`, `approval`, `task-dead`,
`task-regressed`, `change-regressed`, `change-archived`, or
`after-land-failed`; only task kinds
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
