# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Stuck and automatic retry inspection
<!-- source: src/core/status/state.ts, src/core/status/inbox.ts, src/core/status/inbox-text.ts, src/core/status/show.ts, tests/inbox-stuck.test.ts, tests/show-retries.test.ts -->
A dead task whose active marker has `stuck: true` SHALL derive `stuck` with its
fingerprint. Its inbox text row SHALL say the same failure happened twice and
suggest amending the spec or `osq reject`, before its unchanged `osq retry`
command. `osq show` SHALL print `Retries: <n> (<a> automatic)` for a task with
retry events and `Stuck: same failure twice (<fingerprint>)` for a stuck task.

#### Scenario: Stuck task in the inbox
- **WHEN** a dead task's active marker has `stuck: true` and a fingerprint
- **THEN** its inbox row reads `task <n>: <title> — stuck: same failure twice; amend the spec or osq reject <id> --reason <text> — osq retry <id> <n>`

#### Scenario: Retries in show
- **WHEN** a task's event stream has one manual and one automatic `retry` event
- **THEN** its show entry prints `Retries: 2 (1 automatic)`, and a task without retry events prints no such line

## MODIFIED Requirements

### Requirement: Stable inbox object
<!-- source: src/core/status/inbox.ts, src/cli/inbox.ts, tests/inbox.test.ts, tests/inbox-stuck.test.ts -->
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `approval`, `task-dead`,
`task-regressed`, or `change-regressed`; only task kinds SHALL carry
`task: { number, title }`. A `task-dead` item for a stuck task SHALL also carry
`stuck: { fingerprint }`; no other item carries `stuck`. A running item SHALL
contain `change`, `task`, numeric `pid`, ISO `startedAt`, integer non-negative
`elapsedSeconds`, and `command`. A landed item SHALL contain `change`, ISO
`archivedAt`, and `command`. Empty groups SHALL be empty arrays and JSON output
SHALL contain no additional prose or metadata.

#### Scenario: JSON contract projection
- **WHEN** the inbox is serialized for `osq --json`
- **THEN** its property set, discriminants, nested identities, value types, and deterministic array ordering match the stable contract

#### Scenario: Text and JSON parity
- **WHEN** text and JSON are rendered from an equivalent filesystem snapshot and clock
- **THEN** both representations contain the same ordered items, commands, elapsed values, and archive timestamps

#### Scenario: Stuck field
- **WHEN** a dead task is stuck
- **THEN** its `task-dead` item carries `stuck: { fingerprint }` and every other item's JSON is unchanged
