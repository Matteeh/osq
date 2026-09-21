# Spec Delta: Spec Lint and Approve

## ADDED Requirements

### Requirement: Retry approval integrity
<!-- source: src/core/retry.ts, src/core/approve.ts, src/core/hasher.ts, tests/retry.test.ts, tests/dead-marker-retention.test.ts -->
The retry transition SHALL compare the current deterministic change-folder hash
with `.run/approved` before changing any marker or appending an event. A missing
or mismatched approval SHALL leave failure state intact and identify
`osq approve <id>` as the remediation. Approval SHALL update approval artifacts
without renaming an active dead or regressed marker; only retry may retire one.

#### Scenario: Retry matches approval
- **WHEN** an active failed change still matches its approved hash
- **THEN** retry may proceed without changing the approval marker

#### Scenario: Retry finds authored drift
- **WHEN** authored change-folder content no longer matches `.run/approved`
- **THEN** retry refuses before mutation and directs the user to approve the change again

#### Scenario: Reapproval retains active failure
- **WHEN** `osq approve` seals a change that still has an active dead or regressed marker
- **THEN** approval leaves that marker active for an explicit retry or rejection decision

### Requirement: Rejected dependency existence
<!-- source: src/core/linter.ts, src/core/layout.ts, tests/linter.test.ts -->
Dependency validation SHALL recognize a referenced change retained in the
canonical rejected directory as an existing historical change. Existence SHALL
NOT imply that the dependency landed.

#### Scenario: Linting a rejected dependency reference
- **WHEN** a proposal names a dependency whose folder exists only under `openspec/changes/rejected/`
- **THEN** lint does not report the dependency identifier as missing

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/core/parser.ts, src/core/linter.ts, src/core/approve.ts, src/core/hasher.ts, src/core/delta.ts, src/core/migrate.ts, src/cli/lint.ts, src/cli/migrate.ts -->
The Spec Lint and Approve capability SHALL own specification parsing, linting,
approval sealing without failure-state transitions, hashing, dependency
existence validation, and migration logic.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for spec validation and parsing
- **THEN** system maps `src/core/parser.ts`, `src/core/linter.ts`, `src/core/approve.ts`, `src/core/hasher.ts`, `src/core/delta.ts`, `src/core/migrate.ts`, `src/cli/lint.ts`, and `src/cli/migrate.ts` to `spec-lint-and-approve`

## REMOVED Requirements

### Requirement: Dead marker retention and renaming on approval

#### Scenario: First failure preserved on re-approval
- **WHEN** `osq approve` runs on a change containing `.run/dead/1.md` without prior attempt markers
- **THEN** `dead/1.md` is renamed to `dead/1.1.md`

#### Scenario: Subsequent failures increment attempt number
- **WHEN** `osq approve` runs on a change containing `.run/dead/1.md` and existing `dead/1.1.md`
- **THEN** `dead/1.md` is renamed to `dead/1.2.md`
