# Spec Delta: CLI Foundation

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, and npm package distribution.

## ADDED Requirements

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
