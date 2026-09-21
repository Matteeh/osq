# Spec Delta: Status Inspection

## MODIFIED Requirements

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
