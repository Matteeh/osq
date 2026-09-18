# Spec Delta: Spec Lint and Approve

## Purpose

Validates change specifications against structural limits and OpenSpec standards, hashes approved changes deterministically, and seals approved specifications for autonomous execution.

## ADDED Requirements

### Requirement: Code ownership
<!-- source: src/core/parser.ts, src/core/linter.ts, src/core/approve.ts, src/core/hasher.ts, src/core/delta.ts, src/core/migrate.ts, src/cli/lint.ts, src/cli/migrate.ts -->
The Spec Lint and Approve capability SHALL own specification parsing, linting, approval sealing, hashing, and migration logic.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for spec validation and parsing
- **THEN** system maps `src/core/parser.ts`, `src/core/linter.ts`, `src/core/approve.ts`, `src/core/hasher.ts`, `src/core/delta.ts`, `src/core/migrate.ts`, `src/cli/lint.ts`, and `src/cli/migrate.ts` to `spec-lint-and-approve`

### Requirement: Capability code ownership parsing
<!-- source: src/core/parser.ts, tests/parser.test.ts -->
The system SHALL parse `### Requirement: Code ownership` blocks by header name across living and delta specifications.

#### Scenario: Parsing ownership globs from header
- **WHEN** parser inspects any capability specification containing `### Requirement: Code ownership`
- **THEN** system extracts the declared glob list and associates it with the capability

### Requirement: Test modification declaration validation
<!-- source: src/core/linter.ts, tests/linter.test.ts -->
The linter SHALL validate that tasks altering existing tests explicitly declare `tests.modify: true`.

#### Scenario: Valid test modification declaration
- **WHEN** task frontmatter declares `tests.modify: true` as a boolean
- **THEN** linter accepts the declaration and permits test file paths in task scope

#### Scenario: Invalid test modification type
- **WHEN** task frontmatter provides a non-boolean value for `tests.modify`
- **THEN** linter rejects the task with a schema validation error
