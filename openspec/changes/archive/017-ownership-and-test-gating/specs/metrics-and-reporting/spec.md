# Spec Delta: Metrics and Reporting

## Purpose

Aggregates delivery metrics, task runtimes, token consumption, cost calculations, and failure reason breakdowns across active and archived specifications.

## ADDED Requirements

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
