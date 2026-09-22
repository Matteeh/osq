# Spec Delta: Metrics and Reporting

## MODIFIED Requirements

### Requirement: Manifest and measures schema
<!-- source: src/core/manifest.ts, src/core/scope.ts, src/watcher/measures.ts, src/harness/types.ts -->
The metrics subsystem SHALL define typed interfaces for `ManifestData` and
`MeasuresEventData` so downstream report consumers can read them without ad-hoc
parsing. Newly emitted measures SHALL carry `scopeResolver: 2`; legacy events
without that field SHALL remain readable.

#### Scenario: Typed manifest interface
- **WHEN** manifest data is produced or consumed
- **THEN** `ManifestData` declares `hashes`, `osqVersion`, `harness`, `model`, `planner`, `effort`, `createdAt`, `approvedAt`, and `planningSessions`

#### Scenario: Typed measures event interface
- **WHEN** measures event data is produced or consumed
- **THEN** `MeasuresEventData` declares phase, resolver version, resolved-scope and repository counts, word counts, delta counts, and optional scope hashes

#### Scenario: Legacy measures event
- **WHEN** report reads an event emitted before resolver versioning
- **THEN** the absent resolver field classifies its scope-file count as legacy without making the event unreadable

### Requirement: Repository task-size outcome history
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-sizes.test.ts, tests/report-json.test.ts, tests/fixtures/report-sizes/**, fixture/report/** -->
The report `history.sizes` block SHALL expose `scopeFileSeries` with ordered
`legacy` and `resolver-2` rows derived from valid first start measures. Each
series SHALL contain resolver label, nullable `startsAtChange`, scope-file
bucket rows, and its own largest first-attempt pass. The resolver-2 boundary
SHALL be the lowest stable numeric change containing a valid version-2 start
measure; legacy SHALL have a null boundary. Missing resolver fields SHALL be
legacy, exact numeric 2 SHALL be resolver 2, and malformed or unknown versions
SHALL enter neither scope-file series.

Each series SHALL bucket only its own scope-file unit using ordered `1-2`,
`3-4`, `5-8`, and `over-8` rows with task count, first-attempt pass rate, mean
attempts, and nullable median duration. Largest-pass selection and the
scope-limit hint SHALL never compare generations. Acceptance-line buckets SHALL
remain one combined series over every otherwise valid measured task.

The shared recent repository record SHALL use resolver-2 tasks for its
scope-sized largest pass when the selected archive window contains any, and
otherwise use a clearly labeled legacy fallback. It SHALL never select one
largest pass by comparing legacy and resolver-2 scope counts.

#### Scenario: Size against outcome
- **WHEN** history contains valid legacy and resolver-2 measures with conflicting scope sizes
- **THEN** text and JSON expose separate bucket and largest-pass results and identify the first resolver-2 change

#### Scenario: Resolver-2 measures absent
- **WHEN** selected history contains only legacy measures
- **THEN** the resolver-2 series is empty with a null boundary and repository-record size evidence uses the labeled legacy fallback

#### Scenario: Acceptance size spans generations
- **WHEN** valid measured tasks from both generations have acceptance counts
- **THEN** the unchanged acceptance-line series aggregates them because its unit did not change

#### Scenario: Largest pass near a configured limit
- **WHEN** the resolver-2 largest first-attempt pass is no more than one away from a configured scope or acceptance limit
- **THEN** text output contains one observational hint based on resolver-2 scope evidence without comparing a legacy scope count

#### Scenario: Bounded recent archive record
- **WHEN** reporting code derives the planner record from archived changes
- **THEN** it uses at most the 20 highest numeric changes, one resolver generation for scope-sized evidence, and at most ten dead outcome rows without result or diff content

### Requirement: Structured command output and JSON mode
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-json.test.ts, tests/report-sizes.test.ts -->
The system SHALL format reports for terminal display and provide deterministic
raw JSON output. Text output SHALL contain sections named `Now`, `History`,
`Coverage`, `Planning`, `Cycle`, and `Queue`. History text SHALL label legacy
and resolver-2 scope-file series separately and print the first resolver-2
change or unavailable. JSON SHALL expose the same ordered scope series and
boundary while preserving established non-size report fields.

#### Scenario: JSON report output
- **WHEN** user executes `osq report --json`
- **THEN** system emits one deterministically sorted document with separate scope resolver series and all established non-size metrics

#### Scenario: Text report output
- **WHEN** user executes `osq report` without JSON mode
- **THEN** it labels both scope-file generations, the resolver-2 boundary, acceptance sizes, planning, cycle, coverage, and queue data

#### Scenario: Checked-in fixture output
- **WHEN** the built report CLI runs against `fixture/report`
- **THEN** its output including resolver-versioned size history matches the checked-in expected JSON byte for byte
