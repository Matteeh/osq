# Spec Delta: CLI Foundation

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, repository health diagnostics, and npm package distribution.

## ADDED Requirements

### Requirement: Repository health diagnostics
<!-- source: src/cli/doctor.ts, src/core/doctor.ts, tests/doctor.test.ts -->
The CLI SHALL provide a doctor command that validates configuration, harness binary availability, managed blocks, lock states, and archive integrity.

#### Scenario: Doctor passes on healthy repository
- **WHEN** user executes `osq doctor` in a properly configured repository
- **THEN** command prints one status line per check (`config`, `harness`, `managed-blocks`, `locks`, `archives`) and exits with code 0

#### Scenario: Doctor fails on check violation
- **WHEN** any diagnostic check fails (invalid config, missing harness binary, drift in managed blocks, orphaned locks, or invalid archives)
- **THEN** command reports the failed check line and exits with code 1

### Requirement: Planner instruction scaffolding
<!-- source: src/core/init.ts, tests/init-planner.test.ts -->
The project scaffolding SHALL initialize and maintain a managed instructions block in `PLANNER.md`.

#### Scenario: Scaffolding creates or updates PLANNER.md
- **WHEN** user executes `osq init` in a repository
- **THEN** system ensures `PLANNER.md` exists and contains the current managed osq planner protocol between `<!-- OSQ:START -->` and `<!-- OSQ:END -->`
