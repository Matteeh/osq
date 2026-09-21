# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Rejection history
<!-- source: src/core/report.ts, tests/report-rejected.test.ts, fixture/report/** -->
The report `history` block SHALL expose
`rejections: { total, byPlannerModel }`. Rejection history SHALL discover
folders only under the canonical rejected directory and count each folder at
most once only when `.run/events/change.jsonl` contains a valid `rejected`
event. Planner grouping SHALL use a non-empty `planner` value from `brief.md`
frontmatter and `unknown` otherwise. Group keys and rejected folders SHALL be
processed deterministically.

Rejected folders SHALL NOT contribute merely by location or marker presence,
and their preserved tasks, planning logs, manifests, and events SHALL NOT enter
current task state, completion, execution attempts, planning totals, or archive
cycle metrics.

#### Scenario: Rejections grouped by planner model
- **WHEN** rejected folders with valid rejected events record different planner models in their briefs
- **THEN** history reports one rejection per folder and deterministic counts for each recorded model

#### Scenario: Rejection lacks planner attribution
- **WHEN** a rejected folder with a valid rejected event lacks a non-empty brief planner value
- **THEN** it contributes once to total and the `unknown` group

#### Scenario: Folder lacks a valid rejection event
- **WHEN** a folder is hand-moved under rejected or its change-level stream has no valid rejected event
- **THEN** it does not contribute to rejection history

## MODIFIED Requirements

### Requirement: Structured command output and JSON mode
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-json.test.ts, tests/report-rejected.test.ts -->
The system SHALL format reports for terminal display and provide deterministic
raw JSON output. Text output SHALL contain sections named `Now`, `History`,
`Coverage`, `Planning`, and `Cycle`, with rejection totals and planner-model
counts rendered in History. JSON SHALL expose those top-level keys and
`history.rejections` while preserving the names and nested shapes established
for `specs`, `completionRate`, `durations`, `tokens`, and `fileChanges`.

#### Scenario: JSON report output
- **WHEN** user executes `osq report --json`
- **THEN** system emits one deterministically sorted JSON document including rejection history, planning aggregates, and per-change cycle rows

#### Scenario: Text report output
- **WHEN** user executes `osq report` without JSON mode
- **THEN** rejection totals and planner-model grouping appear under History while planning and cycle retain their distinct sections

#### Scenario: Checked-in fixture output
- **WHEN** the built report CLI runs against `fixture/report`
- **THEN** its output, including rejected history, matches the checked-in expected JSON byte for byte

### Requirement: Code ownership
<!-- source: src/core/report.ts, src/core/planning.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The Metrics and Reporting capability SHALL own planning-log parsing, metrics
aggregation including rejection history, report generation, report CLI
formatting, report tests, and the deterministic report fixture.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for planning records or delivery reporting
- **THEN** system maps `src/core/planning.ts`, `src/core/report.ts`, `src/cli/report.ts`, `tests/report*.test.ts`, and `fixture/report/**` to `metrics-and-reporting`
