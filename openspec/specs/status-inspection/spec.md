# Status Inspection

## Purpose

Inspects change folder progress, active tasks, dead letter diagnostics, and runtime execution state across the spec queue.

## Requirements

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
