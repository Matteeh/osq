# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Human attention inbox projection
<!-- source: src/core/inbox.ts, src/core/status.ts, src/core/state.ts, tests/inbox.test.ts -->
The system SHALL derive a human attention inbox with deterministic `needsYou`,
`running`, and `landed` groups. Active attention and running entries SHALL be
projected from the existing status/state snapshot rather than independent
marker reads.

`needsYou` SHALL contain unapproved active changes with `proposal.md`, active
dead and regressed tasks, and active change-level regressions. `running` SHALL
contain only derived running tasks whose parsed lock PID is currently live,
with PID, lock start time, and non-negative elapsed seconds. `landed` SHALL use
only valid typed `archived` events as authoritative archive timestamps. Needs
and running entries SHALL sort by numeric change/task order; landed entries
SHALL sort newest first.

#### Scenario: Mixed attention state
- **WHEN** active changes include unapproved proposals, dead or regressed tasks, a change regression, and live and stale running locks
- **THEN** the inbox contains every attention item once, includes only the live running task, and leaves every marker unchanged

#### Scenario: Recorded archive state
- **WHEN** archived folders contain valid and malformed change-level event streams
- **THEN** only folders with a valid archived event are eligible for the landed group without filesystem-time inference

### Requirement: Action command contract
<!-- source: src/core/inbox.ts, tests/inbox.test.ts -->
Every inbox item SHALL expose one exact `command`. Approval items SHALL use
`osq approve <id>`; dead and regressed tasks SHALL use
`osq retry <id> <n>`; change-level regressions SHALL use
`osq reject <id> --reason <text>`; and running and landed items SHALL use
`osq show <id>`. Each rendered text row SHALL end with the same command.

#### Scenario: Actionable item projection
- **WHEN** any attention, running, or landed item is projected
- **THEN** its JSON command and trailing text command are identical and match its item kind

### Requirement: Stable inbox object
<!-- source: src/core/inbox.ts, src/cli/inbox.ts, tests/inbox.test.ts -->
The inbox object SHALL have exactly the top-level array properties `needsYou`,
`running`, and `landed`.

A needs-you item SHALL contain `kind`, `change: { id, title }`, nullable `task`,
and `command`. Its kind SHALL be one of `approval`, `task-dead`,
`task-regressed`, or `change-regressed`; only task kinds SHALL carry
`task: { number, title }`. A running item SHALL contain `change`, `task`,
numeric `pid`, ISO `startedAt`, integer non-negative `elapsedSeconds`, and
`command`. A landed item SHALL contain `change`, ISO `archivedAt`, and
`command`. Empty groups SHALL be empty arrays and JSON output SHALL contain no
additional prose or metadata.

#### Scenario: JSON contract projection
- **WHEN** the inbox is serialized for `osq --json`
- **THEN** its property set, discriminants, nested identities, value types, and deterministic array ordering match the stable contract

#### Scenario: Text and JSON parity
- **WHEN** text and JSON are rendered from an equivalent filesystem snapshot and clock
- **THEN** both representations contain the same ordered items, commands, elapsed values, and archive timestamps

### Requirement: Per-project last-look cursor
<!-- source: src/core/inbox.ts, src/cli/inbox.ts, tests/inbox.test.ts -->
Every bare inbox invocation SHALL read and then advance
`~/.osq/last-look/<sha256(realpath(project-root))>.json`, whose JSON content
contains an ISO `lastLook` timestamp. A valid cursor SHALL select archived
events strictly later than that timestamp. A missing, deleted, unreadable,
malformed, or invalid-date cursor SHALL select the newest ten recorded
archives. Text and JSON invocations SHALL both advance the cursor without
writing inside any active, archived, or rejected change folder.

#### Scenario: Valid prior look
- **WHEN** a valid project cursor exists
- **THEN** landed contains only changes archived after it and the invocation advances the cursor

#### Scenario: Missing or invalid prior look
- **WHEN** the project cursor cannot supply a valid timestamp
- **THEN** landed contains at most the newest ten recorded archives and a fresh valid cursor is written

### Requirement: Concise inbox text
<!-- source: src/core/inbox.ts, tests/inbox.test.ts -->
Text output SHALL render `Needs you`, `Running`, and `Landed since last look` in
that order. Each empty group SHALL contain exactly one `(none)` line when any
group is non-empty. When every group is empty, output SHALL be exactly
`Inbox empty.`. Running elapsed time SHALL use the existing duration formatter,
and every non-empty item row SHALL end with its exact action command.

#### Scenario: Partially empty inbox
- **WHEN** at least one group contains an item and another group is empty
- **THEN** all headings render and each empty group has one `(none)` line

#### Scenario: Entirely empty inbox
- **WHEN** no group contains an item
- **THEN** the complete text output is the single line `Inbox empty.`

### Requirement: Explicit status remains complete
<!-- source: src/core/status.ts, src/cli/status.ts, tests/status.test.ts, tests/inbox.test.ts -->
`osq status` SHALL retain its existing full active task table, archive count,
rejected-change group, formatting, and command behavior. It SHALL NOT filter
through the inbox or read or advance last-look state.

#### Scenario: Full status after inbox introduction
- **WHEN** a user explicitly executes `osq status`
- **THEN** the complete status overview renders unchanged and no last-look cursor is mutated

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/status.ts, src/core/show.ts, src/core/state.ts, src/core/layout.ts, src/core/inbox.ts -->
The Status Inspection capability SHALL own queue overview status formatting,
detailed change inspection, state derivation, rejected-change presentation,
runtime dependency completion resolution, and the human attention inbox.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for queue or inbox inspection
- **THEN** system maps `src/core/status.ts`, `src/core/show.ts`, `src/core/state.ts`, `src/core/inbox.ts`, and rejected-directory helpers in `src/core/layout.ts` to `status-inspection`
