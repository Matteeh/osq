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

## Delta from Fix packed tarball smoke test and decouple test suite from pnpm

The release-procedure documentation does not mention offline installation; therefore, no specification delta is applied to living documents.
