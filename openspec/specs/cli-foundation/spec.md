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

## Delta from Watcher stale build detection, build identity recording, and dev mode

This change introduces build identity metadata, stale build preflight detection, and reactive dev mode loop execution via capability delta specifications in `specs/cli-foundation/spec.md` and `specs/watcher-and-harness/spec.md`.
