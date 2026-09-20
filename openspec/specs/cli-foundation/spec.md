# cli-foundation Specification

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.

## Requirements

### Requirement: Configuration loading and schema validation
<!-- source: features/cli-foundation.md # Configuration, tests/config.test.ts -->
The system SHALL load operational configuration from `osq.config.ts` merged over `DEFAULT_CONFIG` using the `defineConfig` helper.

#### Scenario: Default configuration resolution
- **WHEN** no `osq.config.ts` exists in the project root
- **THEN** system defaults harness to `agy`, maxConcurrency to 1, maxScopeFiles to 8, and timeouts to standard limits

#### Scenario: Environment variable overrides
- **WHEN** `OSQ_HARNESS` or `OSQ_MODEL` is set in the process environment or `.env`
- **THEN** system overrides the corresponding configuration values

### Requirement: Scaffolding and project initialization
<!-- source: features/cli-foundation.md # Scaffolding (osq init), tests/init.test.ts -->
The system SHALL initialize repository structure and agent instructions via `osq init` idempotently.

#### Scenario: First initialization in clean directory
- **WHEN** user executes `osq init`
- **THEN** system creates `openspec/`, `specs/`, config files, templates, and injects managed block into `AGENTS.md`

#### Scenario: Re-running initialization on existing repository
- **WHEN** user executes `osq init` on an existing project
- **THEN** system preserves existing files outside managed markers and reports existing paths as skipped

### Requirement: Change specification creation
<!-- source: features/cli-foundation.md # Change Creation (osq new <name>), tests/new.test.ts -->
The system SHALL prepare new change specifications via `osq new <name>`.

#### Scenario: Numbering and slugification
- **WHEN** user executes `osq new <name>`
- **THEN** system calculates the next 3-digit padded identifier from active and archived changes, creates a slugified directory, copies templates, and writes the title

### Requirement: Interactive terminal status line and log leveling
<!-- source: features/cli-foundation.md # Leveled Logging & Terminal Output, tests/logger.test.ts, tests/logger-status.test.ts -->
The logger SHALL render a single-line live animated status row on interactive TTY terminals without corrupting permanent logs.

#### Scenario: Interactive TTY rendering
- **WHEN** stderr is an interactive TTY, quiet mode is unset, and CI is unset
- **THEN** status row animates an 80ms spinner, truncates text to terminal width minus spinner prefix, and never applies `[osq]` prefix to status text

#### Scenario: Non-TTY and CI fallback
- **WHEN** stderr is not a TTY or `CI` environment variable is set
- **THEN** logger disables dynamic status animation and status calls become no-ops

### Requirement: Package hygiene and release distribution
<!-- source: features/cli-foundation.md # Distribution & Release Management, tests/package-hygiene.test.ts, tests/bin-execution.test.ts, tests/release-workflow.test.ts -->
The system SHALL package exclusively compiled artifacts and legal metadata for npm distribution.

#### Scenario: Runtime executable version resolution
- **WHEN** `osq --version` is executed from the compiled binary
- **THEN** system dynamically reads version from `package.json` matching release metadata

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

### Requirement: OpenSpec layout initialization and template retirement
<!-- source: src/core/init.ts, tests/init.test.ts -->
The project initialization command SHALL scaffold only `openspec/` directories and configuration files, and SHALL NOT create legacy `specs/` directories or `specs/_template/`.

#### Scenario: Scaffolding creates OpenSpec layout only
- **WHEN** user executes `osq init` in a clean directory
- **THEN** system creates `openspec/` directory structure and configuration, leaving `specs/` uncreated

#### Scenario: Legacy specs template absent
- **WHEN** repository scaffolding is inspected
- **THEN** `specs/_template/` does not exist

### Requirement: OpenSpec agent documentation and managed instructions block
<!-- source: src/core/init.ts, README.md, AGENTS.md, tests/managed-blocks.test.ts -->
The project documentation and managed `AGENTS.md` block SHALL describe the OpenSpec layout and execution protocol, SHALL NOT reference retired paths (`features/`, `specs/`, or `drift against features`), and SHALL preserve foreign OpenSpec blocks during setup.

#### Scenario: Managed block contains no retired paths
- **WHEN** `AGENTS.md` or `MANAGED_AGENTS_MD_BODY` is inspected
- **THEN** neither contains references to `features/`, `specs/`, or `drift against features`

#### Scenario: Foreign OpenSpec block preserved during setup
- **WHEN** `osq setup` executes against an `AGENTS.md` containing an OpenSpec managed block
- **THEN** both `<!-- OPENSPEC:START -->` and `<!-- OSQ:START -->` blocks survive unchanged

### Requirement: Manual task completion command
<!-- source: src/cli/done.ts, src/core/done.ts, src/cli/index.ts, tests/done-manual.test.ts -->
The CLI SHALL provide `osq done <id> <n> --manual "<reason>"` allowing a human to mark a task done with required justification, writing a frontmatter-annotated marker and event.

#### Scenario: Executing osq done with reason
- **WHEN** user runs `osq done <id> <n> --manual "<reason>"`
- **THEN** system writes `.run/done/<n>` with frontmatter declaring `manual: true` and `reason`, and appends `done_manual` event

#### Scenario: Missing manual flag fails command
- **WHEN** user runs `osq done <id> <n>` without `--manual`
- **THEN** command exits non-zero and refuses to mark the task done

### Requirement: Hand-placed done marker detection in doctor
<!-- source: src/core/doctor.ts, tests/doctor.test.ts -->
The `osq doctor` command SHALL inspect all `.run/done/` markers across active change folders and fail if any marker lacks valid frontmatter.

#### Scenario: Hand-placed done marker reported as failure
- **WHEN** a done marker in an active change folder lacks valid automated (`scope_hash`) or manual (`manual: true`) frontmatter
- **THEN** `osq doctor` reports a failure identifying the invalid hand-placed marker

#### Scenario: Legitimate done markers pass
- **WHEN** all done markers possess valid automated or manual frontmatter
- **THEN** doctor done-markers check reports ok

### Requirement: Planner file tool protocol instruction
<!-- source: src/core/init.ts, PLANNER.md, tests/init-planner.test.ts -->
The managed planner instructions block in `PLANNER.md` and `src/core/init.ts` SHALL instruct planners to write files using the file tool rather than shell echo.

#### Scenario: Managed block includes file tool instruction
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** the text contains `Write files with the file tool, never through a shell echo.`

### Requirement: Planner protocol rules in documentation and templates
<!-- source: PLANNER.md, templates/PLANNER.md, src/core/init.ts, tests/init-planner.test.ts -->
The managed planner block in `PLANNER.md`, `templates/PLANNER.md`, and `src/core/init.ts` SHALL encode slicing, detail, file tool, and change-level verify rules.

#### Scenario: Managed block encodes planner discipline
- **WHEN** `PLANNER.md` or `MANAGED_PLANNER_BLOCK` is inspected
- **THEN** it requires task verify commands to exercise complete slices through real entry points, forbids out-of-scope executor excuses, mandates acceptance lines and reuse names without signatures or numbered steps, requires file tool usage, and mandates change-level verify immediately following the goal

#### Scenario: Byte-equality test for planner templates
- **WHEN** `tests/init-planner.test.ts` executes
- **THEN** it asserts byte-for-byte equality between `PLANNER.md` managed block, `templates/PLANNER.md`, and `MANAGED_PLANNER_BLOCK` in `src/core/init.ts`
