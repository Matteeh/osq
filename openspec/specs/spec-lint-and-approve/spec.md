# Spec Lint and Approve

## Purpose

Validates change specifications against structural limits and OpenSpec standards, hashes approved changes deterministically, and seals approved specifications for autonomous execution.

## Requirements

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

### Requirement: Architecture Decision Record 004: Pinned OpenSpec Validator
<!-- source: decisions/004-pinned-openspec-validator.md, decisions/README.md -->
The project SHALL record and accept ADR 004 documenting the pinned `@fission-ai/openspec` dependency, exact version pin, validator execution semantics, and drift diagnostics.

#### Scenario: ADR 004 acceptance and indexing
- **WHEN** decisions in the repository are inspected
- **THEN** `decisions/004-pinned-openspec-validator.md` is present and indexed in `decisions/README.md` as accepted before approval

### Requirement: OpenSpec schema execution authority instructions
<!-- source: templates/openspec/schemas/osq/schema.yaml, templates/openspec/config.yaml, templates/openspec/schemas/osq/README.md -->
The OpenSpec schema template SHALL instruct agents that tasks are executed solely by `osq watch`, archiving is owned exclusively by `osq`, and task checkboxes are runner-written projections.

#### Scenario: Schema instructions enforce execution authority
- **WHEN** an agent reads schema instructions for tasks or apply actions
- **THEN** instructions explicitly prohibit direct task execution or `openspec archive`, delegating execution exclusively to `osq watch`

### Requirement: Proposal change-level verify command declaration
<!-- source: src/core/parser.ts, src/core/linter.ts, tests/linter.test.ts -->
The linter and parser SHALL require that change proposals declare an executable change-level `verify` command in YAML frontmatter.

#### Scenario: Linter requires verify command on proposal
- **WHEN** `proposal.md` lacks a `verify` frontmatter field or provides an empty string
- **THEN** `osq lint` rejects the change folder with a validation error

#### Scenario: Linter accepts valid verify command
- **WHEN** `proposal.md` declares a non-empty `verify` string command in frontmatter
- **THEN** `osq lint` accepts the proposal structure

## Delta from Archive-time verification and tree hashes

This change adds change-level verify linting, done-marker scope hashes, pre-spawn regression detection, regressed status and lifecycle events, and archive-time verification re-runs to `watcher-and-harness` and `spec-lint-and-approve`.
