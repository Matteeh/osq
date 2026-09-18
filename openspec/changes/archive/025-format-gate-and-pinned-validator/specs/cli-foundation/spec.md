# Spec Delta: CLI Foundation

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, repository health diagnostics, and npm package distribution.

## MODIFIED Requirements

### Requirement: Repository health diagnostics
<!-- source: src/cli/doctor.ts, src/core/doctor.ts, tests/doctor.test.ts -->
The CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, archive integrity, and the pinned OpenSpec validator.

#### Scenario: Doctor passes on healthy repository
- **WHEN** user executes `osq doctor` in a properly configured repository with the pinned validator
- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`, `validator`) and exits with code 0

#### Scenario: Doctor fails on check violation
- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, invalid archives, or validator drift)
- **THEN** command reports the failed check line and exits with code 1

#### Scenario: Doctor fails on validator drift
- **WHEN** the installed OpenSpec validator version differs from the pinned version
- **THEN** command reports a failing `validator` line describing version drift and exits with code 1

## ADDED Requirements

### Requirement: Managed block coexistence
<!-- source: src/core/init.ts, src/cli/setup.ts, tests/setup-block-coexistence.test.ts -->
The setup command and managed block updater SHALL preserve foreign OpenSpec managed blocks in `AGENTS.md` without corruption across repeated executions.

#### Scenario: Repeated setup preserves both managed blocks
- **WHEN** `osq setup` executes against an `AGENTS.md` containing `<!-- OPENSPEC:START -->`
- **THEN** both `<!-- OPENSPEC:START -->` and `<!-- OSQ:START -->` blocks survive unchanged across multiple runs

### Requirement: Canonical migration layout authority
<!-- source: src/core/migrate.ts, tests/migrate.test.ts -->
The migration engine SHALL resolve target directory paths exclusively through `src/core/layout.ts`.

#### Scenario: Migration derives targets from layout module
- **WHEN** `osq migrate openspec` resolves target specs, changes, or archive folders
- **THEN** paths derive exclusively from `getSpecsDir`, `getChangesDir`, and `getArchiveDir`