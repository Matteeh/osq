# Spec Delta: Spec Lint and Approve

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/spec/**, src/cli/lint.ts, src/cli/migrate.ts -->
The Spec Lint and Approve capability SHALL own specification parsing, linting,
approval sealing without failure-state transitions, hashing, dependency
existence validation, and migration logic.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for spec validation and parsing
- **THEN** system maps `src/core/spec/**`, `src/cli/lint.ts`, and `src/cli/migrate.ts` to `spec-lint-and-approve`
