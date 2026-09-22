# Spec Delta: Status Inspection

## ADDED Requirements

### Requirement: Recertification inspection
<!-- source: src/core/show.ts, tests/show.test.ts -->
`osq show <id>` SHALL derive an ordered recertification view only from typed
`recertification` events in numbered task streams for active and archived
changes. Each valid row SHALL expose task, timestamp, outcome, differing paths
and per-path attribution, verify command, exit code, and timeout state.

The text view SHALL render a `Recertifications` section only when such rows
exist. Passed outcomes SHALL be labeled recertified and requeued outcomes SHALL
be labeled requeued for agent work. Attribution SHALL render a later task
number, `ambiguous`, or `unknown` for each sorted path. Malformed optional data
SHALL display as unavailable without preventing the rest of the change from
rendering.

#### Scenario: Recertified active or archived task
- **WHEN** a numbered event stream contains a valid passed recertification event
- **THEN** show lists the recertified task, verification result, differing paths, and structured attribution before retaining the complete event timeline

#### Scenario: Failed recertification history
- **WHEN** a task contains a requeued recertification followed by later lifecycle events
- **THEN** show retains the requeued decision as its own ordered history row

#### Scenario: Malformed recertification data
- **WHEN** optional recertification fields are absent or malformed
- **THEN** show renders available identity and outcome with unavailable values and continues rendering all other details

## MODIFIED Requirements

### Requirement: Detailed specification inspection
<!-- source: features/status-inspection.md # Show command, src/core/show.ts, tests/show.test.ts -->
The system SHALL display detailed task lists, metadata, planning sessions,
recertification decisions, results, and complete event timelines via
`osq show <id>`. Derived recertification history SHALL come from numbered typed
events rather than current or retained marker files.

#### Scenario: Detailed spec inspection
- **WHEN** user executes `osq show <id>`
- **THEN** system resolves the folder across active and archive paths, displaying frontmatter, task execution table, recertification history when present, and the complete event timeline
