# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Execution history
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The reporting subsystem SHALL derive execution history only from task event files. Task references SHALL identify both their change and task number. History SHALL contain attempts, tasks with multiple attempts, unexplained re-runs, verification exit codes and missing exit codes, historical dead reasons, and harness-reported cost with attempt coverage.

#### Scenario: Attempt accounting
- **WHEN** task event streams contain `started` events
- **THEN** every `started` event counts as one attempt, every discovered task has a per-task attempt count, and tasks with multiple attempts are identified

#### Scenario: Unexplained re-run
- **WHEN** a task has another `started` event without an intervening `dead` or `regressed` event
- **THEN** history counts the transition as an unexplained re-run and identifies the change and task

#### Scenario: Verification history
- **WHEN** task event streams contain `verify_ran` events
- **THEN** history retains their ordered numeric exit codes or explicit missing values and reports the number lacking an exit code

### Requirement: Event-file coverage
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The reporting subsystem SHALL derive event-file coverage from the presence of `.run/events/<n>.jsonl` for every discovered task. Coverage SHALL report totals and group task numbers with and without event files by change.

#### Scenario: Event-file coverage
- **WHEN** discovered tasks have a mixture of present and absent task event files
- **THEN** coverage reports totals and per-change task-number lists for both sets, treating an existing empty file as covered

## MODIFIED Requirements

### Requirement: Task and specification metrics derivation
<!-- source: features/metrics-and-reporting.md # Metric Derivation Rules, tests/report.test.ts, tests/report-task-states.test.ts -->
The system SHALL derive specification metrics and current task state across active and archived changes via `osq report`. Current task state SHALL come only from marker files and SHALL contain total, done, verified, manual, dead, regressed, running, and pending counts. Historical terminal events SHALL NOT override current marker state.

#### Scenario: Active and archive state sourcing
- **WHEN** `osq report` is executed
- **THEN** current task state for active and archived changes is derived from marker precedence, while specification totals retain their active and archived classification

#### Scenario: Current and historical failure differ
- **WHEN** a currently done task has an earlier dead event
- **THEN** current state counts it as done and execution history retains the dead event

#### Scenario: Regressed current state
- **WHEN** a task has a regressed marker
- **THEN** current state counts it as regressed rather than dead, running, or pending

### Requirement: Cost reporting and price table disclaimer
<!-- source: features/metrics-and-reporting.md # Reported Cost & Price Table Disclaimer, tests/report-cost.test.ts -->
The system SHALL sum finite harness-reported cost values from task events without estimating missing cost. Cost reporting SHALL identify harness-reported provenance, retain total, formatted-total, and per-change values, and state how many attempts contained at least one cost value out of all recorded attempts. Consumer guidance SHALL retain the price-table disclaimer.

#### Scenario: Cost provenance and attempt coverage
- **WHEN** `osq report` renders cost history
- **THEN** output names harness-reported cost and states `n of m attempts reported cost`, counting each cost-bearing attempt once

#### Scenario: No reported cost
- **WHEN** no recorded attempt contains a finite cost value
- **THEN** history reports zero harness-reported cost with zero covered attempts and does not estimate a value

#### Scenario: Disclaimer display
- **WHEN** users consult cost-reporting guidance
- **THEN** it states that reported cost reflects harness price tables rather than final billing invoices

### Requirement: Failure categorization by dead reason
<!-- source: features/metrics-and-reporting.md # Failure Categorization, tests/report-failure-breakdown.test.ts -->
The system SHALL categorize every historical task `dead` event by its event reason without substituting current dead-marker reasons. An absent or empty event reason SHALL be categorized as `unknown`.

#### Scenario: Historical failure aggregation
- **WHEN** task event streams contain `dead` events across attempts
- **THEN** report history aggregates every event by reason even when the task is currently done

#### Scenario: Marker without historical event
- **WHEN** a current dead marker has no corresponding dead event
- **THEN** current state counts the dead task while history does not invent a dead event or reason

### Requirement: Structured command output and JSON mode
<!-- source: features/metrics-and-reporting.md # Structured Output, tests/report-json.test.ts -->
The system SHALL format reports for terminal display and provide deterministic raw JSON output. Text output SHALL contain sections named `Now`, `History`, and `Coverage`. JSON SHALL expose those top-level keys in place of the former top-level `tasks`, `failureBreakdown`, and `cost` keys, while preserving the names and nested shapes of `specs`, `completionRate`, `durations`, `tokens`, and `fileChanges`.

#### Scenario: JSON report output
- **WHEN** user executes `osq report --json`
- **THEN** system emits one deterministically sorted JSON document conforming to the revised `MetricsReport` schema

#### Scenario: Text report output
- **WHEN** user executes `osq report` without JSON mode
- **THEN** current marker state, historical events, and event-file coverage appear under their distinct named sections

#### Scenario: Checked-in fixture output
- **WHEN** the built report CLI runs against `fixture/report`
- **THEN** its output matches the checked-in expected JSON byte for byte

### Requirement: Code ownership
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The Metrics and Reporting capability SHALL own metrics aggregation, report generation, report CLI formatting, report tests, and the deterministic report fixture.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for delivery reporting
- **THEN** system maps `src/core/report.ts`, `src/cli/report.ts`, `tests/report*.test.ts`, and `fixture/report/**` to `metrics-and-reporting`

### Requirement: Manual task completion accounting
<!-- source: src/core/report.ts, tests/report.test.ts -->
The metrics and reporting subsystem SHALL distinguish manual task completions from automated verified completions in the current-state block, terminal output, and JSON data. Both counts SHALL always be present, including when zero.

#### Scenario: Reporting separates manual and verified completions
- **WHEN** `osq report` generates current state for any set of changes
- **THEN** text and JSON output present explicit verified and manual counts whose sum equals done completions
