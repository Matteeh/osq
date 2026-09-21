# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Planning metrics report
<!-- source: src/core/planning.ts, src/core/report.ts, src/cli/report.ts, tests/report-planning.test.ts, fixture/report/** -->
`osq report` SHALL expose a top-level `planning` block derived only from
`.run/plan.jsonl` across active and archived changes. It SHALL include session
count, total wall seconds, wall seconds grouped by change, aggregate input,
output, cached, and reasoning tokens, aggregate harness-reported cost, and
numeric usage coverage. A session counts as covered when at least one token or
cost field in its matched `plan_exited` record is a finite harness-reported
number, including zero.

Text output SHALL render the exact phrase
`n of m sessions reported usage`. Null usage values contribute nothing to sums
and SHALL remain distinguishable from observed zero values in the source log.

#### Scenario: Mixed planning usage coverage
- **WHEN** planning logs contain sessions with complete, partial, and unavailable usage
- **THEN** report totals only finite recorded values and coverage counts each session with any reported usage once

#### Scenario: Per-change planning wall time
- **WHEN** planning sessions exist for more than one change
- **THEN** JSON and text output show total wall time and deterministic per-change wall-time sums

### Requirement: Archived change cycle metrics
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-cycle.test.ts, fixture/report/** -->
`osq report` SHALL expose a top-level `cycle` block with one deterministically
ordered JSON row for every archived change. Each row SHALL contain the change
identifier and nullable seconds for brief date to manifest `approvedAt`,
`approvedAt` to the earliest task `started` event, earliest task `started` to
the change-level `archived` event, and the total of all three phases.

The brief date SHALL be parsed from `brief.md` frontmatter using standard ISO
date semantics. Each phase SHALL be null when either endpoint is missing,
invalid, or precedes its start; total SHALL be null unless all phases are
present. Phase aggregates SHALL report total, average, and `n of m archived
changes` coverage. Text output SHALL show only these aggregate lines; per-change
cycle rows SHALL remain in JSON.

#### Scenario: Complete archived lifecycle
- **WHEN** an archived change has valid brief, approval, first-start, and archive timestamps
- **THEN** all three non-negative phase durations and their sum appear in its JSON row and contribute to aggregate lines

#### Scenario: Historical change lacks timestamps
- **WHEN** an archived change predates one or more lifecycle records
- **THEN** its row retains null for unavailable phases and totals without filesystem-time inference or backfill

## MODIFIED Requirements

### Requirement: Manifest and measures schema
<!-- source: src/core/manifest.ts, src/watcher/measures.ts, src/harness/types.ts -->
The metrics subsystem SHALL define typed interfaces for `ManifestData` and
`MeasuresEventData` so downstream report consumers can read them without ad-hoc
parsing.

#### Scenario: Typed manifest interface
- **WHEN** manifest data is produced or consumed
- **THEN** `ManifestData` declares `hashes`, `osqVersion`, `harness`, `model`, `planner`, `effort`, `createdAt`, `approvedAt`, and `planningSessions`

#### Scenario: Typed measures event interface
- **WHEN** measures event data is produced or consumed
- **THEN** `MeasuresEventData` declares `phase`, scope/repo/changed counts, word counts, delta counts, and optional `scopeHashes`

### Requirement: Structured command output and JSON mode
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-json.test.ts -->
The system SHALL format reports for terminal display and provide deterministic
raw JSON output. Text output SHALL contain sections named `Now`, `History`,
`Coverage`, `Planning`, and `Cycle`. JSON SHALL expose those top-level keys while
preserving the names and nested shapes established for `specs`,
`completionRate`, `durations`, `tokens`, and `fileChanges`.

#### Scenario: JSON report output
- **WHEN** user executes `osq report --json`
- **THEN** system emits one deterministically sorted JSON document including planning aggregates and per-change cycle rows

#### Scenario: Text report output
- **WHEN** user executes `osq report` without JSON mode
- **THEN** planning totals and aggregate cycle phases appear under their distinct named sections

#### Scenario: Checked-in fixture output
- **WHEN** the built report CLI runs against `fixture/report`
- **THEN** its output matches the checked-in expected JSON byte for byte

### Requirement: Code ownership
<!-- source: src/core/report.ts, src/core/planning.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The Metrics and Reporting capability SHALL own planning-log parsing, metrics
aggregation, report generation, report CLI formatting, report tests, and the
deterministic report fixture.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for planning records or delivery reporting
- **THEN** system maps `src/core/planning.ts`, `src/core/report.ts`, `src/cli/report.ts`, `tests/report*.test.ts`, and `fixture/report/**` to `metrics-and-reporting`
