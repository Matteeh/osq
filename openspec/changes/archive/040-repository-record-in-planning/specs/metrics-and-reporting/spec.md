# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Repository task-size outcome history
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-sizes.test.ts, tests/report-json.test.ts, tests/fixtures/report-sizes/**, fixture/report/** -->
The report `history` block SHALL expose `sizes` derived from task files and
append-only numbered task event streams across active and archived changes.
Only tasks with a valid first start measures event SHALL contribute. Sizes
SHALL be bucketed independently by scope files and acceptance lines using the
ordered buckets `1-2`, `3-4`, `5-8`, and `over-8`. Each bucket SHALL contain
task count, first-attempt pass rate, mean attempts, and nullable median duration
seconds.

History SHALL also expose the single first-attempt pass with the greatest scope
file count, including its change id, task number and title, scope files, and
acceptance lines. Text output SHALL render both size tables and exactly one
hint line when that task's observed scope or acceptance size is within one of
the corresponding configured limit, naming the limit, configured value, and
observed size without changing configuration.

The reporting subsystem SHALL provide the shared repository-record derivation
used by planning. It SHALL inspect at most the 20 most recent archived changes
by numeric id and return measured task count, first-attempt pass rate, median
task duration, the largest first-attempt pass, and at most ten deterministic
dead-event rows containing change id, task title, and reason. Missing reasons
SHALL be `unknown`. Size and record derivation SHALL read only task metadata and
task events, never result text, diffs, or filesystem timestamps.

#### Scenario: Size against outcome
- **WHEN** measured task events span multiple scope and acceptance buckets
- **THEN** report JSON and text show deterministic task count, first-attempt pass rate, mean attempts, and median duration for every ordered bucket

#### Scenario: Largest pass near a configured limit
- **WHEN** the largest first-attempt pass is no more than one away from a configured scope or acceptance limit
- **THEN** text output contains one observational hint naming every matching limit, configured value, and observed task size

#### Scenario: Bounded recent archive record
- **WHEN** reporting code derives the planner record from archived changes
- **THEN** it uses only the 20 highest numeric changes and returns aggregates plus at most ten dead outcome rows without result or diff content

## MODIFIED Requirements

### Requirement: Structured command output and JSON mode
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-json.test.ts, tests/report-queue.test.ts, tests/report-sizes.test.ts -->
The system SHALL format reports for terminal display and provide deterministic
raw JSON output. Text output SHALL contain sections named `Now`, `History`,
`Coverage`, `Planning`, `Cycle`, and `Queue`. JSON SHALL expose those top-level
keys and `history.sizes` while preserving the names and nested shapes
established for `specs`, `completionRate`, `durations`, `tokens`, `fileChanges`,
planning, cycle, and queue.

#### Scenario: JSON report output
- **WHEN** user executes `osq report --json`
- **THEN** system emits one deterministically sorted JSON document including size outcomes, planning aggregates, per-change cycle rows, and the stable queue view

#### Scenario: Text report output
- **WHEN** user executes `osq report` without JSON mode
- **THEN** task-size outcome tables, planning totals, aggregate cycle phases, and queue progress appear in their established sections

#### Scenario: Checked-in fixture output
- **WHEN** the built report CLI runs against `fixture/report`
- **THEN** its output including `history.sizes` matches the checked-in expected JSON byte for byte
