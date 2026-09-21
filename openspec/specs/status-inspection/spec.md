# status-inspection Specification

## Purpose

Provides operational visibility into active and archived specifications, task states, locks, and event timelines through `osq status` and `osq show`.

## Requirements

### Requirement: Specification queue status inspection
<!-- source: features/status-inspection.md # Status Inspection, src/core/status.ts, tests/status.test.ts, tests/status-rejected.test.ts -->
The system SHALL display an overview of active specifications, an archived
change count, and a separately listed rejected-change group via `osq status`.

#### Scenario: Displaying status queue
- **WHEN** user executes `osq status`
- **THEN** system displays status indicator, spec identifier, task progress, and title for every active change folder, the archive count, and rejected changes in their own group

### Requirement: Detailed specification inspection
<!-- source: features/status-inspection.md # Show command, tests/show.test.ts -->
The system SHALL display detailed task lists, metadata, and event timelines via `osq show <id>`.

#### Scenario: Detailed spec inspection
- **WHEN** user executes `osq show <id>`
- **THEN** system resolves the folder across active and archive paths, displaying frontmatter, task execution table, and event timeline

### Requirement: Code ownership
<!-- source: src/core/status.ts, src/core/show.ts, src/core/state.ts, src/core/layout.ts, src/core/inbox.ts -->
The Status Inspection capability SHALL own queue overview status formatting,
detailed change inspection, state derivation, rejected-change presentation,
runtime dependency completion resolution, and the human attention inbox.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for queue or inbox inspection
- **THEN** system maps `src/core/status.ts`, `src/core/show.ts`, `src/core/state.ts`, `src/core/inbox.ts`, and rejected-directory helpers in `src/core/layout.ts` to `status-inspection`

### Requirement: Undeclared test change status inspection
<!-- source: src/core/status.ts, src/core/show.ts, tests/show.test.ts -->
The status and show commands SHALL present `undeclared_test_change` dead status and diagnostic details.

#### Scenario: Status line rendering for undeclared test change
- **WHEN** a task fails with dead reason `undeclared_test_change`
- **THEN** `osq status` formats the task line as `[dead] (reason: undeclared_test_change)`

#### Scenario: Show command diagnostics
- **WHEN** `osq show <id>` inspects a task marked dead with `undeclared_test_change`
- **THEN** output displays diagnostic details identifying modified test files

### Requirement: Planning session inspection
<!-- source: src/core/show.ts, tests/show.test.ts -->
`osq show <id>` SHALL read `.run/plan.jsonl`, correlate lifecycle records by
planning-session identifier, and list sessions in start order with harness,
model, start time, exit code, and wall seconds. Missing or malformed planning
logs SHALL not prevent the remaining change details from rendering.

#### Scenario: Inspecting repeated planning
- **WHEN** a change has more than one planning lifecycle pair
- **THEN** show output lists every session and its recorded wall time before the task event timeline

#### Scenario: Incomplete or malformed planning history
- **WHEN** a planning session lacks a matching exit record or the log contains malformed lines
- **THEN** show retains the valid session with unavailable exit fields and continues rendering tasks and events

### Requirement: Rejected change status group
<!-- source: src/core/layout.ts, src/core/status.ts, tests/status-rejected.test.ts -->
`osq status` SHALL discover changes under the canonical rejected directory and
render them in a deterministic `Rejected specs` group separate from active
specifications and the archived count. Each rejected row SHALL identify the
folder and title plus rejection reason and timestamp when valid marker metadata
is available. Missing or malformed rejection metadata SHALL be shown as
unavailable without hiding the change.

#### Scenario: Rejected changes are listed separately
- **WHEN** active, archived, and rejected change folders exist
- **THEN** status lists each rejected folder only in `Rejected specs` and does not add it to active state or archived totals

#### Scenario: Rejection metadata is malformed
- **WHEN** a rejected folder has a missing or malformed `.run/rejected.md`
- **THEN** status still lists the folder and title with unavailable rejection metadata

### Requirement: Rejected dependency resolution
<!-- source: src/core/state.ts, src/core/layout.ts, tests/state-rejected.test.ts -->
Runtime dependency resolution SHALL recognize a dependency retained under the
canonical rejected directory and SHALL always treat it as not landed. Approval,
done markers, tasks, or other preserved contents inside the rejected folder
SHALL NOT satisfy the dependency.

#### Scenario: Rejected dependency remains unmet
- **WHEN** an active change depends on an identifier found under `rejected/`
- **THEN** its dependency remains unmet and the change derives as blocked even if the rejected folder contains done markers

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
