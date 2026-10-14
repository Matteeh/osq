## MODIFIED Requirements

### Requirement: Dashboard home
The home view SHALL render the `Inbox` document in three groups: Needs you,
Running, and Landed. Each needs-you item SHALL show its kind in words, its
change and task, and its exact `command` as code, and link to its change page.
Running items SHALL show their task and elapsed time. A paused running item
SHALL show its task and `paused until <YYYY-MM-DD HH:MM> UTC` from its
`pausedUntil` instead of an elapsed time. Landed items SHALL show
their archive time and SHALL be labelled as landed since the last `osq` look.
Each empty group SHALL say so in one line.

#### Scenario: Needs you
- **WHEN** the inbox holds a dead task
- **THEN** home shows it under Needs you with its `osq retry <id> <n>` command

#### Scenario: Quiet repository
- **WHEN** all three groups are empty
- **THEN** home shows one empty-state line per group and no error

#### Scenario: Paused task on home
- **WHEN** the inbox's running group holds a paused item for task 2 of change `007` with `pausedUntil` `2099-01-01T09:30:00.000Z`
- **THEN** home shows it under Running with `paused until 2099-01-01 09:30 UTC`, a link to change `007`, and no `elapsed` text
