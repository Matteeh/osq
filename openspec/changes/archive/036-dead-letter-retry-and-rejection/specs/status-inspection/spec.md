# Spec Delta: Status Inspection

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Specification queue status inspection
<!-- source: features/status-inspection.md # Status Inspection, src/core/status.ts, tests/status.test.ts, tests/status-rejected.test.ts -->
The system SHALL display an overview of active specifications, an archived
change count, and a separately listed rejected-change group via `osq status`.

#### Scenario: Displaying status queue
- **WHEN** user executes `osq status`
- **THEN** system displays status indicator, spec identifier, task progress, and title for every active change folder, the archive count, and rejected changes in their own group

### Requirement: Code ownership
<!-- source: src/core/status.ts, src/core/show.ts, src/core/state.ts, src/core/layout.ts -->
The Status Inspection capability SHALL own queue overview status formatting,
detailed change inspection, state derivation, rejected-change presentation,
and runtime dependency completion resolution.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for queue inspection
- **THEN** system maps `src/core/status.ts`, `src/core/show.ts`, `src/core/state.ts`, and rejected-directory helpers in `src/core/layout.ts` to `status-inspection`
