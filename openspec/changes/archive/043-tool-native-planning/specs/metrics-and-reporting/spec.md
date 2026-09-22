# Spec Delta: Metrics and Reporting

## MODIFIED Requirements

### Requirement: Planning metrics report
<!-- source: src/core/planning.ts, src/core/report.ts, src/cli/report.ts, tests/report-planning.test.ts, fixture/report/** -->
`osq report` SHALL expose a top-level planning block derived only from valid
owned and observed `.run/plan.jsonl` records across active and archived
changes. Legacy records without source SHALL remain readable as owned. The
block SHALL preserve the established valid-start session count, wall seconds,
per-change wall time, observed token and cost sums, incomplete-session handling,
and numeric usage coverage.

The block SHALL additionally report how many distinct changes contain at least
one valid `plan_started` record of either source. Multiple sessions for one
change SHALL count once; malformed lines and exit-only records SHALL not make a
change covered. Null values SHALL contribute nothing and observed zero SHALL
remain distinct from unavailable data.

#### Scenario: Mixed planning usage coverage
- **WHEN** owned and observed logs contain sessions with complete, partial, and unavailable usage
- **THEN** report totals only finite recorded values and counts each session with any reported usage once

#### Scenario: Per-change planning wall time
- **WHEN** planning sessions of either source exist for more than one change
- **THEN** JSON and text preserve deterministic total and per-change wall-time sums

#### Scenario: Mixed planning sources
- **WHEN** valid owned and observed sessions occur across active and archived changes
- **THEN** existing planning aggregates include both sources without changing incomplete-session semantics and the planning-change count includes each change once

#### Scenario: Incomplete planning history
- **WHEN** a change has only malformed lines or exit records without a valid start
- **THEN** it contributes neither a session nor a covered change while the rest of the report renders

### Requirement: Structured command output and JSON mode
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-json.test.ts, tests/report-planning.test.ts, fixture/report/** -->
The system SHALL format reports for terminal display and deterministic raw JSON.
The planning section in both forms SHALL state the count of changes with a
valid owned or observed planning start while preserving every established
planning and non-planning report field.

#### Scenario: JSON report output
- **WHEN** a user executes `osq report --json`
- **THEN** the deterministic document preserves all established fields and includes the planning-record change count

#### Scenario: Text report output
- **WHEN** a user executes `osq report` without JSON mode
- **THEN** every established section remains and Planning states how many changes have a planning record

#### Scenario: Checked-in fixture output
- **WHEN** the built report CLI runs against `fixture/report`
- **THEN** its output, including planning coverage, matches the checked-in expected JSON byte for byte

#### Scenario: Planning coverage is reported
- **WHEN** report data contains valid planning starts
- **THEN** text and stable JSON agree on the distinct covered-change count

#### Scenario: No planning record exists
- **WHEN** no active or archived change has a valid planning start
- **THEN** both formats report zero covered changes without inventing usage or planner attribution
