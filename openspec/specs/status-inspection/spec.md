# status-inspection Specification

## Purpose

Provides operational visibility into active and archived specifications, task states, locks, and event timelines through `osq status` and `osq show`.

## Requirements

### Requirement: Specification queue status inspection
<!-- source: features/status-inspection.md # Status Inspection, tests/status.test.ts -->
The system SHALL display an overview of active and archived specifications via `osq status`.

#### Scenario: Displaying status queue
- **WHEN** user executes `osq status`
- **THEN** system displays status indicator, spec identifier, task progress, and title for every change folder

### Requirement: Detailed specification inspection
<!-- source: features/status-inspection.md # Show command, tests/show.test.ts -->
The system SHALL display detailed task lists, metadata, and event timelines via `osq show <id>`.

#### Scenario: Detailed spec inspection
- **WHEN** user executes `osq show <id>`
- **THEN** system resolves the folder across active and archive paths, displaying frontmatter, task execution table, and event timeline

### Requirement: Code ownership
<!-- source: src/core/status.ts, src/core/show.ts, src/core/state.ts -->
The Status Inspection capability SHALL own queue overview status formatting, detailed change inspection, and state derivation.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for queue inspection
- **THEN** system maps `src/core/status.ts`, `src/core/show.ts`, and `src/core/state.ts` to `status-inspection`

### Requirement: Undeclared test change status inspection
<!-- source: src/core/status.ts, src/core/show.ts, tests/show.test.ts -->
The status and show commands SHALL present `undeclared_test_change` dead status and diagnostic details.

#### Scenario: Status line rendering for undeclared test change
- **WHEN** a task fails with dead reason `undeclared_test_change`
- **THEN** `osq status` formats the task line as `[dead] (reason: undeclared_test_change)`

#### Scenario: Show command diagnostics
- **WHEN** `osq show <id>` inspects a task marked dead with `undeclared_test_change`
- **THEN** output displays diagnostic details identifying modified test files
