# Spec Delta: CLI Foundation

## Purpose

Provides command-line interface entrypoints, configuration loading, leveled logging with an interactive status sink, project scaffolding, repository health diagnostics, and npm package distribution.

## ADDED Requirements

### Requirement: Canonical OpenSpec path layout
<!-- source: src/core/layout.ts, src/core/config.ts, tests/layout.test.ts -->
The engine SHALL derive all change folder and run artifact locations through a canonical layout module anchored to `openspecRoot`, removing redundant spec and archive path configurations.

#### Scenario: Layout derivation from OpenSpec root
- **WHEN** change folders or `.run` artifact paths are resolved
- **THEN** paths derive deterministically from `openspecRoot` without referencing independent specs or archive path overrides

#### Scenario: Configuration schema excludes legacy paths
- **WHEN** configuration is validated or loaded
- **THEN** `paths.specs` and `paths.archive` are absent from `OsqPaths` and rejected by linting
