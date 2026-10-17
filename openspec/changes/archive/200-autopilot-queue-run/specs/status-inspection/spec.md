## ADDED Requirements

### Requirement: Queue approval record
`osq queue approve` SHALL write `<openspecRoot>/.run/queue-approval.md`. Its
frontmatter holds `approved_at`, an ISO time; `approver`, the git user as
`<name> <<email>>` or empty without one; and `items`, each queue item's slug
mapped to its hash, in queue order. The approval's hash SHALL be `sha256:`
and the hex SHA-256 of the file's text. A missing or unparsable file reads as
no approval.

#### Scenario: Item approval
- **WHEN** a queue item is checked against the queue approval
- **THEN** its approval is this

| record | item's slug in the record | approval |
| --- | --- | --- |
| none | – | `unapproved` |
| present | absent | `unapproved` |
| present | with the item's hash | `approved` |
| present | with another hash | `changed` |

### Requirement: Queue view shows the approval
Without a queue approval `osq queue` SHALL print exactly what it printed
before. With one it SHALL print
`Approved by <approver> at <approved_at> (<hash>)` right after the `Queue:`
line and end each item line with ` approved`, ` changed since approval` or
` not approved` for the item's approval.

#### Scenario: Queue view with an approval
- **WHEN** `osq queue` runs after `osq queue approve` and the second of two items was then edited
- **THEN** its second line is `Approved by <approver> at <approved_at> (<hash>)`, the first item's line ends ` approved`, and the second item's line ends ` changed since approval`

#### Scenario: Queue view without an approval
- **WHEN** `osq queue` runs with no queue approval record
- **THEN** it prints exactly what `formatQueue` returns for the projection

### Requirement: Autopilot stop record
An autopilot stop SHALL be one file, `<openspecRoot>/.run/autopilot-stop.md`.
Its frontmatter holds `reason`, `item`, `change` (the change id, absent before
the item has a change), `command` and `at`; its body is the detail, empty when
there is none. A missing or unparsable file SHALL read as no stop, and
removing a missing file SHALL succeed.

#### Scenario: Stop record round trip
- **WHEN** a stop with reason `land_stopped`, item `orders`, change `003`, command `osq land 003` and detail `exit code 1` is written and read back
- **THEN** the read stop has exactly those fields and its `at`, and after it is removed it reads as no stop

### Requirement: Autopilot change marker
A change autopilot creates SHALL hold `.run/autopilot.md`, whose frontmatter
holds `item`, `queue_approval` (the queue approval's hash) and `created_at`,
then `planner_started_at` and `approved_at` once autopilot reaches them. A
change without the marker belongs to a human, and autopilot never plans or
approves it.

#### Scenario: Marker round trip
- **WHEN** a marker with item `orders`, a queue approval hash and `created_at` is written, then `planner_started_at` is added
- **THEN** reading it gives all four fields, and `approved_at` is absent

### Requirement: Autopilot next step
For the first queue item that has not landed, osq SHALL name one next step:
`done`, `wait`, `plan-next`, `plan`, `approve`, `land`, or `stop` with a
reason and the command that resumes the queue. The table's rows are checked
in order and the first that matches wins. Another approved change means an
active, approved change that is not the item's own.

#### Scenario: Autopilot steps
- **WHEN** autopilot's next step is read in this state
- **THEN** it is this step

| state | step |
| --- | --- |
| no queue file | `done` |
| the queue file does not parse | `stop`, `queue_unreadable`, `osq queue` |
| a usage-limit pause is active | `wait` |
| every item landed | `done` |
| another approved change is active | `wait` |
| the item has no change and no recorded hash | `stop`, `not_approved`, `osq queue approve` |
| the item has no change and another recorded hash | `stop`, `changed_since_approval`, `osq queue approve` |
| the item was rejected | `stop`, `rejected`, `osq plan --next --replan` |
| the item is unplanned | `plan-next` |
| its change is unapproved and has no marker | `wait` |
| its marker has no `planner_started_at` | `plan` |
| its planner is `running` | `wait` |
| its planner is `ready` | `approve` |
| its planner is `lint_red` | `stop`, `planner_not_ready`, `osq plan <id>` |
| its planner started and no planner run is current | `wait` |
| its change is approved and its next step is `running` or `blocked` | `wait` |
| its change's next step is `dead` | `stop`, `halted`, the next step's command |
| its change is archived and not landed | `land` |

### Requirement: Autopilot stop in the inbox
With a stop record, the inbox SHALL hold one needs-you item of kind
`autopilot-stopped`, with `task` null, the record's command, and
`autopilotStopped` holding the reason, item, change id or null, and detail.
Its change SHALL be the change's id and title, or the item's slug and queue
title before the item has a change. Its text line SHALL read
`<id>: <title> — autopilot stopped: <reason>`, then `: <detail>` with
whitespace collapsed when there is a detail, then ` — <command>`.

#### Scenario: Stop with a change in the inbox
- **WHEN** the stop record holds reason `halted`, item `orders`, change `003` titled `Orders`, command `osq retry 003 1` and detail `task 1 dead`
- **THEN** the inbox holds one `autopilot-stopped` item for change `003` titled `Orders` with `autopilotStopped` `{ reason: "halted", item: "orders", change: "003", detail: "task 1 dead" }`, and its line reads `  003: Orders — autopilot stopped: halted: task 1 dead — osq retry 003 1`

#### Scenario: Stop before a change in the inbox
- **WHEN** the stop record holds reason `not_approved`, item `orders`, no change and command `osq queue approve`, and the queue item `orders` is titled `Orders are totalled`
- **THEN** the item's change is `{ id: "orders", title: "Orders are totalled" }`, its `autopilotStopped.change` is null, and its line reads `  orders: Orders are totalled — autopilot stopped: not_approved — osq queue approve`

#### Scenario: No stop in the inbox
- **WHEN** no stop record exists
- **THEN** the inbox holds no `autopilot-stopped` item

### Requirement: Autopilot stop in status
`osq status` SHALL add one line after its other lines when a stop record
exists: `Autopilot stopped at <item>`, then ` (change <id>)` when the stop
names a change, then `: <reason> — <command>`. Without one it SHALL add
nothing.

#### Scenario: Stop in status
- **WHEN** `osq status` runs with this stop record
- **THEN** its last line is this

| stop | last line |
| --- | --- |
| reason `land_stopped`, item `orders`, change `003`, command `osq land 003` | `Autopilot stopped at orders (change 003): land_stopped — osq land 003` |
| reason `not_approved`, item `orders`, no change, command `osq queue approve` | `Autopilot stopped at orders: not_approved — osq queue approve` |
