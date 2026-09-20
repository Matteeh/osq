# metrics-and-reporting Specification

## Purpose

Collects, derives, and reports task execution metrics, token utilization, costs, failure categorizations, and file modifications across active and archived change specifications.

## Requirements

### Requirement: Task and specification metrics derivation
<!-- source: features/metrics-and-reporting.md # Metric Derivation Rules, tests/report.test.ts, tests/report-task-states.test.ts -->
The system SHALL derive metrics across active and archived specifications via `osq report`.

#### Scenario: Active and archive state sourcing
- **WHEN** `osq report` is executed
- **THEN** active spec metrics are sourced from `deriveSpecState` and archived spec metrics from `.run/events/<n>.jsonl`

### Requirement: Token consumption and cache accounting
<!-- source: features/metrics-and-reporting.md # Token Metric Derivation, tests/report-tokens.test.ts -->
The system SHALL calculate prompt, candidate, total, cached, and reasoning tokens with cache-share percentage.

#### Scenario: Adapter-reported cache counter priority
- **WHEN** harness event stream contains explicit `cachedTokens`
- **THEN** metric calculation uses the reported value directly rather than remainder derivation

#### Scenario: Reasoning token separation
- **WHEN** harness reports reasoning tokens
- **THEN** reasoning tokens are reported separately and excluded from cached token counts

### Requirement: Cost reporting and price table disclaimer
<!-- source: features/metrics-and-reporting.md # Reported Cost & Price Table Disclaimer, tests/report-cost.test.ts -->
The system SHALL display reported costs accompanied by a price table disclaimer.

#### Scenario: Disclaimer display
- **WHEN** `osq report` renders cost summaries
- **THEN** output includes notice that costs reflect harness price tables rather than final billing invoices

### Requirement: Failure categorization by dead reason
<!-- source: features/metrics-and-reporting.md # Failure Categorization, tests/report-failure-breakdown.test.ts -->
The system SHALL categorize task failures across retries by dead event reasons.

#### Scenario: Historical failure aggregation
- **WHEN** tasks fail with `verify_red`, `spec_conflict`, `no_result`, `crashed`, `timeout`, or `already_running`
- **THEN** report aggregates counts and percentages for each failure reason

### Requirement: File modification extraction
<!-- source: features/metrics-and-reporting.md # File Modification Extraction, tests/report-file-changes.test.ts -->
The system SHALL aggregate modified files from tool events.

#### Scenario: Tool event file extraction
- **WHEN** events stream contains `edit` or `write` tool events
- **THEN** report aggregates unique paths and modification counts

### Requirement: Structured command output and JSON mode
<!-- source: features/metrics-and-reporting.md # Structured Output, tests/report-json.test.ts -->
The system SHALL format reports for terminal display and provide raw JSON output.

#### Scenario: JSON report output
- **WHEN** user executes `osq report --json`
- **THEN** system emits structured JSON conforming to `MetricsReport` schema

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
- **THEN** `ManifestData` interface declares `hashes`, `osqVersion`, `harness`, `model`, `planner`, `effort`, `createdAt`, and `approvedAt`

#### Scenario: Typed measures event interface
- **WHEN** measures event data is produced or consumed
- **THEN** `MeasuresEventData` interface declares `phase`, scope/repo/changed counts, word counts, delta counts, and optional `scopeHashes`

### Requirement: Manual task completion accounting
<!-- source: src/core/report.ts, tests/report.test.ts -->
The metrics and reporting subsystem SHALL distinguish manual task completions from automated verified completions in `TaskMetrics`, terminal output, and JSON data.

#### Scenario: Reporting separates manual and verified completions
- **WHEN** `osq report` generates delivery metrics for changes containing manual completions
- **THEN** report output presents distinct counts for verified tasks and manually completed tasks
