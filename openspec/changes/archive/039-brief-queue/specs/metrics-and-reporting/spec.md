# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Brief queue delivery view
<!-- source: src/core/queue.ts, src/core/report.ts, src/cli/report.ts, tests/report-queue.test.ts, fixture/report/** -->
`osq report` SHALL expose a stable top-level `queue` view in text and JSON. It
SHALL contain a configured flag, landed and total item counts, queue planning
session count, finite recorded cost and cost coverage, source-ordered item
rows, active failure rows, and retained rejection rows.

Queue planning totals SHALL include valid planning starts from associated
active, archived, and rejected attempts. Cost coverage SHALL be complete only
for sessions with correlated exits carrying finite cost, including zero. These
queue totals SHALL NOT change the established global planning block's scope or
coverage semantics.

Each item row SHALL contain slug, title, derived state, selected change id or
null, rejection count, section drift, and nullable planned-to-landed seconds.
Elapsed time SHALL use the earliest valid planning start for the item and the
valid typed archive event for its landed association, and SHALL remain null for
missing, invalid, or reversed endpoints without filesystem-time inference.

Failure rows SHALL expose active dead or regressed task and change targets with
their recorded reason or an unavailable value. Rejection rows SHALL retain one
row per rejected queue attempt with slug, change, reason, and timestamp,
showing unavailable malformed metadata without dropping the attempt. A missing
queue file SHALL produce a deterministic unconfigured empty view; a present
malformed queue SHALL report its parse error.

#### Scenario: Queue delivery history
- **WHEN** queue items include landed, active failed, and rejected attempts with mixed planning telemetry
- **THEN** text and JSON show deterministic progress, recorded spend and coverage, covered elapsed times, and unsuccessful outcomes with reasons

#### Scenario: Queue not configured
- **WHEN** `openspec/queue.md` is absent
- **THEN** report returns an unconfigured empty queue view while preserving every existing non-queue metric

## MODIFIED Requirements

### Requirement: Structured command output and JSON mode
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-json.test.ts, tests/report-queue.test.ts -->
The system SHALL format reports for terminal display and provide deterministic
raw JSON output. Text output SHALL contain sections named `Now`, `History`,
`Coverage`, `Planning`, `Cycle`, and `Queue`. JSON SHALL expose those top-level
keys while preserving the names and nested shapes established for `specs`,
`completionRate`, `durations`, `tokens`, `fileChanges`, planning, and cycle.

#### Scenario: JSON report output
- **WHEN** user executes `osq report --json`
- **THEN** system emits one deterministically sorted JSON document including planning aggregates, per-change cycle rows, and the stable queue view

#### Scenario: Text report output
- **WHEN** user executes `osq report` without JSON mode
- **THEN** planning totals, aggregate cycle phases, and queue progress appear under distinct named sections

#### Scenario: Checked-in fixture output
- **WHEN** the built report CLI runs against `fixture/report`
- **THEN** its output matches the checked-in expected JSON byte for byte
