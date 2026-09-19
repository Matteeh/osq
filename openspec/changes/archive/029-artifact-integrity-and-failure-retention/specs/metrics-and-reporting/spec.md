# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Manual task completion accounting
<!-- source: src/core/report.ts, tests/report.test.ts -->
The metrics and reporting subsystem SHALL distinguish manual task completions from automated verified completions in `TaskMetrics`, terminal output, and JSON data.

#### Scenario: Reporting separates manual and verified completions
- **WHEN** `osq report` generates delivery metrics for changes containing manual completions
- **THEN** report output presents distinct counts for verified tasks and manually completed tasks
