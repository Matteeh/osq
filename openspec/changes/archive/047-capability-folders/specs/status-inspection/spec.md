# Spec Delta: Status Inspection

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/status/**, tests/queue*.test.ts -->
The Status Inspection capability SHALL own execution queue overview formatting,
detailed change inspection, state derivation, rejected-change presentation,
runtime dependency completion resolution, human attention projection, and
read-only brief queue parsing and state projection.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for status, inbox, or brief queue inspection
- **THEN** system maps `src/core/status/**` and `tests/queue*.test.ts` to status-inspection
