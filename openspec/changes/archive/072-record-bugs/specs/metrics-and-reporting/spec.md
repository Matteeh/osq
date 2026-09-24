# Spec Delta: Metrics and Reporting

## ADDED Requirements

### Requirement: Trusted manifest approval time
<!-- source: src/core/run/manifest-approval.ts, src/watcher/auto-retry.ts, src/core/web/web-data-lifecycle.ts, src/core/report/planning-slice-lookup.ts, src/core/report/report.ts, tests/manifest-approval-gate.test.ts -->
A change's manifest `approvedAt` SHALL count as its approval time only when the
change folder holds `.run/approved`. Automatic retry, the dashboard's change
metadata, the report, and planning turn attribution SHALL read it through
`readManifestApprovedAt` in `src/core/run/manifest-approval.ts`, which returns
null otherwise. Records are not rewritten.

#### Scenario: Plan-time approval time without approval
- **WHEN** a change's manifest has `approvedAt` and the folder has no `.run/approved`
- **THEN** automatic retry counts from the last manual retry alone, the dashboard shows no approved time, and planning turn attribution uses no boundary from that manifest

#### Scenario: Approved change
- **WHEN** a change's manifest has `approvedAt` and the folder holds `.run/approved`
- **THEN** every reader uses that `approvedAt` as before

## MODIFIED Requirements

### Requirement: Manifest and measures schema
<!-- source: src/core/run/manifest.ts, src/core/scope.ts, src/watcher/measures.ts, src/harness/types.ts -->
The metrics subsystem SHALL define typed interfaces for `ManifestData` and
`MeasuresEventData` so downstream report consumers can read them without ad-hoc
parsing. Newly emitted measures SHALL carry `scopeResolver: 2`; legacy events
without that field SHALL remain readable.

#### Scenario: Typed manifest interface
- **WHEN** manifest data is produced or consumed
- **THEN** `ManifestData` declares `hashes`, `osqVersion`, `harness`, `model`, `planner`, `effort`, `createdAt`, optional `createdAtSource`, optional `approvedAt`, and `planningSessions`

#### Scenario: Typed measures event interface
- **WHEN** measures event data is produced or consumed
- **THEN** `MeasuresEventData` declares phase, resolver version, resolved-scope and repository counts, word counts, delta counts, and optional scope hashes

#### Scenario: Legacy measures event
- **WHEN** report reads an event emitted before resolver versioning
- **THEN** the absent resolver field classifies its scope-file count as legacy without making the event unreadable

### Requirement: Archived change cycle metrics
<!-- source: src/core/report/report.ts, src/core/report/brief-to-approval.ts, src/cli/report.ts, tests/report-cycle.test.ts, tests/report-record-accuracy.test.ts, fixture/report/** -->
`osq report` SHALL expose a top-level `cycle` block with one deterministically
ordered JSON row for every archived change. Each row SHALL contain the change
identifier and nullable seconds for brief to approval, approval to the earliest
task `started` event, earliest task `started` to the change-level `archived`
event, and the total of all three phases.

Brief to approval SHALL run from the manifest's `createdAt` to its trusted
`approvedAt`, and SHALL be null when the manifest lacks
`createdAtSource: "created"`. Approval times SHALL be trusted manifest approval
times. Each phase SHALL be null when either endpoint is missing, invalid, or
precedes its start; total SHALL be null unless all phases are present. Phase
aggregates SHALL report total, average, and `n of m archived changes` coverage,
and a phase no archived change covers SHALL print `not reported` in place of
its total and average. Text output SHALL show only these aggregate lines;
per-change cycle rows SHALL remain in JSON.

#### Scenario: Complete archived lifecycle
- **WHEN** an archived change has a marked creation time, a trusted approval, a first start, and an archive timestamp
- **THEN** all three non-negative phase durations and their sum appear in its JSON row and contribute to aggregate lines

#### Scenario: Manifest without the creation marker
- **WHEN** an archived change's manifest has `createdAt` without `createdAtSource`
- **THEN** its brief to approval and total are null, whatever its brief date

#### Scenario: Historical change lacks timestamps
- **WHEN** an archived change predates one or more lifecycle records
- **THEN** its row retains null for unavailable phases and totals without filesystem-time inference or backfill

#### Scenario: Uncovered phase
- **WHEN** no archived change has a value for a phase
- **THEN** its text line reads `not reported (0 of <m> archived changes)`

### Requirement: Repository task-size outcome history
<!-- source: src/core/report/report.ts, src/core/report/scope-size.ts, src/cli/report.ts, tests/report-sizes.test.ts, tests/report-json.test.ts, tests/report-record-accuracy.test.ts, tests/fixtures/report-sizes/**, fixture/report/** -->
A measured task's scope size SHALL be the number of files in the `scopeHashes`
of its last `measures` end event that carries them, which includes files the
task created, and otherwise its first valid start event's `scopeFiles`.

The report `history.sizes` block SHALL expose `scopeFileSeries` with ordered
`legacy` and `resolver-2` rows derived from valid first start measures. Each
series SHALL contain resolver label, nullable `startsAtChange`, scope-file
bucket rows, and its own largest first-attempt pass. The resolver-2 boundary
SHALL be the lowest stable numeric change containing a valid version-2 start
measure; legacy SHALL have a null boundary. Missing resolver fields SHALL be
legacy, exact numeric 2 SHALL be resolver 2, and malformed or unknown versions
SHALL enter neither scope-file series.

Each series SHALL bucket only its own tasks by scope size using ordered `1-2`,
`3-4`, `5-8`, and `over-8` rows with task count, first-attempt pass rate, mean
attempts, and nullable median duration. Largest-pass selection and the
scope-limit hint SHALL never compare generations. Acceptance-line buckets SHALL
remain one combined series over every otherwise valid measured task.

The shared recent repository record SHALL carry `measuredTasks` and
`firstAttemptPasses`, and print them as `First-attempt passes:
<passed>/<measured>`. It SHALL use resolver-2 tasks for its scope-sized largest
pass when the selected archive window contains any, and otherwise use a clearly
labeled legacy fallback. It SHALL never select one largest pass by comparing
legacy and resolver-2 scope counts.

#### Scenario: Size against outcome
- **WHEN** history contains valid legacy and resolver-2 measures with conflicting scope sizes
- **THEN** text and JSON expose separate bucket and largest-pass results and identify the first resolver-2 change

#### Scenario: Created files count
- **WHEN** a task's start event records `scopeFiles: 0` and its end event lists five files with a null `before` hash
- **THEN** its scope size is 5 in the buckets, the largest first-attempt pass, and the repository record

#### Scenario: No end event
- **WHEN** a task has a valid start event and no end event with `scopeHashes`
- **THEN** its scope size is the start event's `scopeFiles`

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

#### Scenario: First-attempt passes as a count
- **WHEN** eight measured tasks in the window all passed on their first attempt
- **THEN** the repository record prints `First-attempt passes: 8/8`, and a record with fewer than five measured tasks prints the unchanged too-small sentence

### Requirement: Planning turn attribution
<!-- source: src/core/report/planning-slice.ts, src/core/report/planning-observed.ts, src/core/report/planning-slice-lookup.ts, tests/planning-slice.test.ts -->
Within one session, a turn that edited a change folder SHALL belong to the
first change it edited. The session's approvals of changes it edited SHALL
split it into segments. Any other turn SHALL belong to the change edited next
within its segment, or else to the change whose approval closes the segment.
Another change's approval time SHALL come from its recorded slice for the same
session, else its trusted manifest approval time. No turn SHALL be attributed
to more than one change.

#### Scenario: Sequential planning
- **WHEN** one session plans three changes and each is approved before the next is edited
- **THEN** the three slices do not overlap and each ends at or before its change's approval

#### Scenario: Parallel planning
- **WHEN** one session interleaves edits to two changes before approving either
- **THEN** every turn up to the second approval is recorded in exactly one of the two changes

#### Scenario: Discussion before the first edit
- **WHEN** turns without edits precede the session's first edit to a change in the same segment
- **THEN** those turns belong to that change

#### Scenario: Reapproval does not move a boundary
- **WHEN** an earlier change was approved again after its slice was recorded
- **THEN** later changes use the approval time recorded in that slice

#### Scenario: Unapproved change sets no boundary
- **WHEN** another change edited in the session has a plan-time manifest `approvedAt` and no `.run/approved`
- **THEN** that change contributes no approval boundary
