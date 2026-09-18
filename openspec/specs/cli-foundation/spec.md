# CLI Foundation

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.

## Requirements

### Requirement: Code ownership
<!-- source: osq.config.ts, src/cli/**, src/core/config.ts, src/core/init.ts, src/core/logger.ts, templates/** -->
The CLI Foundation capability SHALL own CLI entrypoints, configuration, logger, initialization, and templates.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI or configuration files
- **THEN** system maps `src/cli/**`, `src/core/config.ts`, `src/core/init.ts`, `src/core/logger.ts`, `templates/**`, and `osq.config.ts` to `cli-foundation`

### Requirement: Test gating configuration
<!-- source: src/core/config.ts, tests/config.test.ts -->
The configuration loader SHALL define test file patterns used for test modification gating.

#### Scenario: Default test pattern resolution
- **WHEN** no custom test patterns are declared in `osq.config.ts`
- **THEN** system defaults test gating matchers to `tests/**`

### Requirement: Watch stale build and dev mode CLI options
<!-- source: src/cli/index.ts, src/cli/watch.ts -->
The CLI watch command SHALL support options to bypass stale build detection and enable reactive dev execution.

#### Scenario: Stale build bypass flag
- **WHEN** user executes `osq watch --allow-stale`
- **THEN** CLI passes `allowStale: true` to the watch loop options

#### Scenario: Reactive dev mode flag
- **WHEN** user executes `osq watch --dev`
- **THEN** CLI passes `dev: true` to the watch loop options

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

### Requirement: Planner instruction scaffolding
<!-- source: src/core/init.ts, tests/init-planner.test.ts -->
The project scaffolding SHALL initialize and maintain a managed instructions block in `PLANNER.md`.

#### Scenario: Scaffolding creates or updates PLANNER.md
- **WHEN** user executes `osq init` in a repository
- **THEN** system ensures `PLANNER.md` exists and contains the current managed osq planner protocol between `<!-- OSQ:START -->` and `<!-- OSQ:END -->`

### Requirement: Canonical OpenSpec path layout
<!-- source: src/core/layout.ts, src/core/config.ts, tests/layout.test.ts -->
The engine SHALL derive all change folder and run artifact locations through a canonical layout module anchored to `openspecRoot`, removing redundant spec and archive path configurations.

#### Scenario: Layout derivation from OpenSpec root
- **WHEN** change folders or `.run` artifact paths are resolved
- **THEN** paths derive deterministically from `openspecRoot` without referencing independent specs or archive path overrides

#### Scenario: Configuration schema excludes legacy paths
- **WHEN** configuration is validated or loaded
- **THEN** `paths.specs` and `paths.archive` are absent from `OsqPaths` and rejected by linting

### Requirement: Complete layout consumer cut-over
<!-- source: src/core/layout.ts, src/core/status.ts, src/core/show.ts, src/core/report.ts, src/cli/lint.ts -->
All CLI entrypoints and core workflow commands SHALL derive change and archive directory paths strictly through `src/core/layout.ts` without reading `config.paths.specs` or `config.paths.archive`.

#### Scenario: Status inspection resolves via layout
- **WHEN** user executes `osq status`
- **THEN** command resolves change folders from `getChangesDir(config.paths.openspecRoot, cwd)` and archive count from `getArchiveDir(config.paths.openspecRoot, cwd)`

#### Scenario: Show and report commands resolve via layout
- **WHEN** user executes `osq show` or `osq report`
- **THEN** commands locate spec folders and completed archives using canonical layout helpers

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

## Delta from Format gate completion: ADR 004, pinned validator diagnostics, schema hardening, and setup coexistence

This change establishes ADR 004, doctor validator pin verification, schema execution authority instructions, setup block coexistence, and canonical migration layout resolution.
