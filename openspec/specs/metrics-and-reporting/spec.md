# Metrics And Reporting

## Purpose

Aggregates delivery metrics, task runtimes, token consumption, cost calculations, and failure reason breakdowns across active and archived specifications.

## Requirements

### Requirement: Code ownership
<!-- source: src/core/report.ts, src/cli/report.ts -->
The Metrics and Reporting capability SHALL own metrics aggregation, report generation, and report CLI formatting.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for delivery reporting
- **THEN** system maps `src/core/report.ts` and `src/cli/report.ts` to `metrics-and-reporting`

### Requirement: Undeclared test change failure metrics
<!-- source: src/core/report.ts, tests/report.test.ts -->
The reporting subsystem SHALL aggregate `undeclared_test_change` occurrences across failure reason breakdowns.

#### Scenario: Report table failure categorization
- **WHEN** `osq report` generates delivery metrics for specs containing `undeclared_test_change` failures
- **THEN** failure breakdown lists `undeclared_test_change` counts in human-readable and JSON reporting modes

### Requirement: Manifest and measures schema
<!-- source: src/core/manifest.ts, src/watcher/measures.ts, src/harness/types.ts -->
The metrics subsystem SHALL define typed interfaces for `ManifestData` and `MeasuresEventData` so downstream report consumers can read them without ad-hoc parsing.

#### Scenario: Typed manifest interface
- **WHEN** manifest data is produced or consumed
- **THEN** `ManifestData` interface declares `hashes`, `osqVersion`, `harness`, `model`, `effort`, `createdAt`, and `approvedAt`

#### Scenario: Typed measures event interface
- **WHEN** measures event data is produced or consumed
- **THEN** `MeasuresEventData` interface declares `phase`, scope/repo/changed counts, word counts, delta counts, and optional `scopeHashes`

## Delta from Raw measures and a run manifest

This change adds run manifest generation at approval time and raw measures event emission at task start and end to `watcher-and-harness` and `metrics-and-reporting`.
