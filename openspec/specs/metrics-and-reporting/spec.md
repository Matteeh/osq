# metrics-and-reporting Specification

## Purpose

Collects, derives, and reports task execution metrics, token utilization, costs, failure categorizations, and file modifications across active and archived change specifications.

## Requirements

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

### Requirement: File modification extraction
<!-- source: features/metrics-and-reporting.md # File Modification Extraction, tests/report-file-changes.test.ts -->
The system SHALL aggregate modified files from tool events.

#### Scenario: Tool event file extraction
- **WHEN** events stream contains `edit` or `write` tool events
- **THEN** report aggregates unique paths and modification counts

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

### Requirement: Code ownership
<!-- source: src/core/report.ts, src/core/planning.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The Metrics and Reporting capability SHALL own planning-log parsing, metrics
aggregation including rejection history, report generation, report CLI
formatting, report tests, and the deterministic report fixture.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for planning records or delivery reporting
- **THEN** system maps `src/core/planning.ts`, `src/core/report.ts`, `src/cli/report.ts`, `tests/report*.test.ts`, and `fixture/report/**` to `metrics-and-reporting`

### Requirement: Undeclared test change failure metrics
<!-- source: src/core/report.ts, tests/report.test.ts -->
The reporting subsystem SHALL aggregate `undeclared_test_change` occurrences across failure reason breakdowns.

#### Scenario: Report table failure categorization
- **WHEN** `osq report` generates delivery metrics for specs containing `undeclared_test_change` failures
- **THEN** failure breakdown lists `undeclared_test_change` counts in human-readable and JSON reporting modes

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

### Requirement: Manual task completion accounting
<!-- source: src/core/report.ts, tests/report.test.ts -->
The metrics and reporting subsystem SHALL distinguish manual task completions from automated verified completions in the current-state block, terminal output, and JSON data. Both counts SHALL always be present, including when zero.

#### Scenario: Reporting separates manual and verified completions
- **WHEN** `osq report` generates current state for any set of changes
- **THEN** text and JSON output present explicit verified and manual counts whose sum equals done completions

### Requirement: Execution history
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The reporting subsystem SHALL derive execution history only from numbered task
event files. Task references SHALL identify both their change and task number.
History SHALL contain attempts, tasks with multiple attempts, unexplained
re-runs, verification exit codes and missing exit codes, historical dead
reasons, scope-regression detection and recertification counts, repository size
evidence, and harness-reported cost with attempt coverage. Change-level streams
and active or retained markers SHALL NOT invent task execution history.

#### Scenario: Attempt accounting
- **WHEN** task event streams contain `started` events
- **THEN** every `started` event counts as one attempt, every discovered task has a per-task attempt count, and tasks with multiple attempts are identified

#### Scenario: Unexplained re-run
- **WHEN** a task has another `started` event without an intervening dead or regressed event
- **THEN** history counts the transition as an unexplained re-run and identifies the change and task

#### Scenario: Verification history
- **WHEN** task event streams contain `verify_ran` events
- **THEN** history retains their ordered numeric exit codes or explicit missing values and reports the number lacking an exit code

#### Scenario: Scope recertification is not execution
- **WHEN** scope detection verification or human recertification occurs without an agent start
- **THEN** scope regression history changes while execution attempt and unexplained-rerun history does not

### Requirement: Event-file coverage
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The reporting subsystem SHALL derive event-file coverage from the presence of `.run/events/<n>.jsonl` for every discovered task. Coverage SHALL report totals and group task numbers with and without event files by change.

#### Scenario: Event-file coverage
- **WHEN** discovered tasks have a mixture of present and absent task event files
- **THEN** coverage reports totals and per-change task-number lists for both sets, treating an existing empty file as covered

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

### Requirement: Scope regression history
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report-scope-regressions.test.ts, tests/report-json.test.ts, fixture/report/expected.json -->
The report `history` block SHALL expose
`scopeRegressions: { detected, verificationPassedAtDetection,
verificationFailedAtDetection, recertifiedByHuman, requeuedForAgent }` in text
and stable JSON, with every counter present as a non-negative integer including
zero.

Counts SHALL derive only from valid typed events in numbered task streams
across active and archived changes. A `regressed` event with
`reason: scope_regression` SHALL increment detected; finite exit code zero SHALL
also increment passed at detection and a finite non-zero exit SHALL increment
failed at detection. A `recertification` event with `outcome: passed` SHALL
increment recertified by human, while `outcome: requeued` SHALL increment
requeued for agent. Missing or malformed outcome fields SHALL not be guessed.

Detection and recertification events SHALL NOT count as execution attempts,
multiple-attempt tasks, unexplained reruns, dead reasons, or cost coverage. A
later agent `started` event after requeue SHALL retain ordinary execution
attempt accounting.

#### Scenario: Mixed scope regression history
- **WHEN** numbered event streams contain passing, failing, legacy, and malformed scope detections plus passed and requeued recertifications
- **THEN** report counts each valid category once, retains detected coverage for legacy scope events, and leaves malformed outcome subsets unchanged

#### Scenario: No scope regression history
- **WHEN** no numbered task stream contains scope-regression or recertification events
- **THEN** text and JSON expose all five scope regression counters as zero

#### Scenario: Requeue later executes
- **WHEN** failed human recertification is followed by an agent started event
- **THEN** history counts one requeue decision and counts only the started event as the new execution attempt
