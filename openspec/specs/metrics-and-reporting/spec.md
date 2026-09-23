# metrics-and-reporting Specification

## Purpose

Collects, derives, and reports task execution metrics, token utilization, costs, failure categorizations, and file modifications across active and archived change specifications.

## Requirements

### Requirement: Task and specification metrics derivation
<!-- source: src/core/report/report.ts, tests/report.test.ts, tests/report-task-states.test.ts, tests/report-now.test.ts, tests/report-unreported.test.ts -->
The system SHALL derive specification metrics and current task state across active and archived changes via `osq report`. Current task state SHALL come only from marker files and SHALL contain total, done, verified, manual, dead, regressed, running, pending, and unmarked counts. Pending SHALL count only tasks in active changes that have no terminal or running marker. A task in an archived change without a done, dead, regressed, or running marker SHALL count as unmarked. Historical terminal events SHALL NOT override current marker state.

#### Scenario: Active and archive state sourcing
- **WHEN** `osq report` is executed
- **THEN** current task state for active and archived changes is derived from marker precedence, while specification totals retain their active and archived classification

#### Scenario: Current and historical failure differ
- **WHEN** a currently done task has an earlier dead event
- **THEN** current state counts it as done and execution history retains the dead event

#### Scenario: Regressed current state
- **WHEN** a task has a regressed marker
- **THEN** current state counts it as regressed rather than dead, running, or pending

#### Scenario: Archived task without markers
- **WHEN** an archived change holds tasks with no marker
- **THEN** current state counts them as unmarked, not pending, and the text report prints an `Unmarked:` line

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

### Requirement: Code ownership
<!-- source: src/core/report/**, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
The Metrics and Reporting capability SHALL own planning-log parsing, metrics
aggregation including rejection history, report generation, report CLI
formatting, report tests, and the deterministic report fixture.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for planning records or delivery reporting
- **THEN** system maps `src/core/report/**`, `src/cli/report.ts`, `tests/report*.test.ts`, and `fixture/report/**` to `metrics-and-reporting`

### Requirement: Undeclared test change failure metrics
<!-- source: src/core/report.ts, tests/report.test.ts -->
The reporting subsystem SHALL aggregate `undeclared_test_change` occurrences across failure reason breakdowns.

#### Scenario: Report table failure categorization
- **WHEN** `osq report` generates delivery metrics for specs containing `undeclared_test_change` failures
- **THEN** failure breakdown lists `undeclared_test_change` counts in human-readable and JSON reporting modes

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

### Requirement: Manual task completion accounting
<!-- source: src/core/report.ts, tests/report.test.ts -->
The metrics and reporting subsystem SHALL distinguish manual task completions from automated verified completions in the current-state block, terminal output, and JSON data. Both counts SHALL always be present, including when zero.

#### Scenario: Reporting separates manual and verified completions
- **WHEN** `osq report` generates current state for any set of changes
- **THEN** text and JSON output present explicit verified and manual counts whose sum equals done completions

### Requirement: Execution history
<!-- source: src/core/report.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
Reporting SHALL derive execution history only from numbered task event files,
with task references naming change and task. History SHALL contain attempts,
multi-attempt tasks, unexplained re-runs, verification exit codes and
missing exit codes, pre-spawn verify runs and mismatches, dead reasons,
scope-regression and recertification counts, repository size evidence, and
harness-reported cost with attempt coverage. Change-level streams and markers
SHALL NOT invent task execution history.

#### Scenario: Attempt accounting
- **WHEN** task event streams contain `started` events
- **THEN** every `started` event counts as one attempt, every discovered task has a per-task attempt count, and tasks with multiple attempts are identified

#### Scenario: Unexplained re-run
- **WHEN** a task has another `started` event without an intervening dead or regressed event
- **THEN** history counts the transition as an unexplained re-run and identifies the change and task

#### Scenario: Verification history
- **WHEN** task event streams contain `verify_ran` events without `phase: "pre_spawn"`
- **THEN** history retains their ordered numeric exit codes or explicit missing values and reports the number lacking an exit code

#### Scenario: Pre-spawn verify history
- **WHEN** task event streams contain `verify_ran` events with `phase: "pre_spawn"`
- **THEN** `history.preSpawnVerify` counts them as `runs`, counts those with `mismatch: true` as `mismatches`, lists the mismatched task references in sorted order as `mismatchedTasks`, the text report prints `Pre-spawn verify mismatches: <mismatches> of <runs> runs`, and none of them enter verification history

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
<!-- source: src/core/report/planning.ts, src/core/report/planning-economics.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-planning.test.ts, tests/report-planning-economics.test.ts, fixture/report/** -->
`osq report` SHALL expose a planning block from valid owned and observed
`.run/plan.jsonl` records across active and archived changes, keeping the
session count, wall seconds, per-change wall time, token and cost sums, usage
coverage, and planning-change count. `planning.byChange` SHALL give per change
sessions, tokens by kind, active minutes, cost, spec words, changed lines, spec
words per changed line, and minutes from last planning edit to approval.
`planning.comparison` SHALL compare planning and executor tokens and cost.

#### Scenario: Mixed planning usage coverage
- **WHEN** owned and observed logs contain sessions with complete, partial, and unavailable usage
- **THEN** report totals only finite recorded values and counts each session with any reported usage once

#### Scenario: Per-change planning wall time
- **WHEN** planning sessions of either source exist for more than one change
- **THEN** JSON and text preserve deterministic total and per-change wall-time sums

#### Scenario: Mixed planning sources
- **WHEN** valid owned and observed sessions occur across active and archived changes
- **THEN** existing planning aggregates include both sources and the planning-change count includes each change once

#### Scenario: Incomplete planning history
- **WHEN** a change has only malformed lines or exit records without a valid start
- **THEN** it contributes neither a session nor a covered change while the rest of the report renders

#### Scenario: Per-change planning economics
- **WHEN** a change has sliced planning records and task `measures` events
- **THEN** its `byChange` entry sums slice tokens and active minutes, takes spec words from the first task start's `proposalWords` plus each task's first `taskWords`, and changed lines from each task's last `measures` end

#### Scenario: Legacy planning record
- **WHEN** a change's only planning record has no `slice`
- **THEN** its entry keeps usage totals and reports active minutes, cache split, and minutes to approval as null

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

### Requirement: Unreported cost labelling
<!-- source: src/core/report/report.ts, tests/report-unreported.test.ts, tests/report-planning.test.ts, tests/report-json.test.ts, tests/report-planning-economics.test.ts -->
Every formatted cost in `osq report` text and JSON `formattedTotal` SHALL read
`not reported` when no counted attempt or session reported a cost, instead of a
dollar amount, even when those sessions reported tokens. When at least one did,
the formatted value SHALL stay a dollar amount alongside its coverage. Numeric
`total` fields SHALL stay the sum of reported values.

#### Scenario: Planning without reported cost
- **WHEN** planning sessions exist, some reporting tokens, but none reported a cost
- **THEN** `planning.cost.formattedTotal` and the text report's planning cost read `not reported`

#### Scenario: Execution without reported cost
- **WHEN** attempts exist but none reported a cost, or no attempt exists
- **THEN** `history.cost.formattedTotal` reads `not reported` and the coverage still shows `0 of N`

### Requirement: Planning turn attribution
<!-- source: src/core/report/planning-slice.ts, src/core/report/planning-observed.ts, tests/planning-slice.test.ts -->
Within one session, a turn that edited a change folder SHALL belong to the
first change it edited. The session's approvals of changes it edited SHALL
split it into segments. Any other turn SHALL belong to the change edited next
within its segment, or else to the change whose approval closes the segment.
Another change's approval time SHALL come from its recorded slice for the same
session, else its `manifest.json` `approvedAt`. No turn SHALL be attributed to
more than one change.

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

### Requirement: Planning slice measures
<!-- source: src/core/report/planning-slice.ts, tests/planning-slice.test.ts -->
A slice's active minutes SHALL sum the gaps between consecutive owned turns,
leaving out any gap longer than `planning.idleGapMinutes`. Its cost SHALL be,
in order: the sum of per-turn reported costs when every turn reported one; the
session's whole-session cost when the slice holds every turn of the session; a
`planning.prices` estimate when every turn's model is priced and reports input
and output tokens; otherwise null. `costSource` SHALL be `harness`,
`price_table`, or null.

#### Scenario: Idle gap
- **WHEN** owned turns are 2, 3, and 25 minutes apart and the idle gap is 10 minutes
- **THEN** active minutes are 5

#### Scenario: Partial session with cost-state
- **WHEN** a session reports a whole-session cost and the slice holds only part of its turns
- **THEN** the slice's cost is not taken from that whole-session cost

#### Scenario: Price table
- **WHEN** no harness reported a cost and every owned turn's model has a price entry
- **THEN** cost is the sum of each kind's tokens times its price per million, and `costSource` is `price_table`

### Requirement: Approval flag outcomes
<!-- source: src/core/report/approval-flags.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-approval-flags.test.ts, fixture/report/** -->
`osq report` SHALL read `approvalFlags` from each active and archived change's
manifest and report, per flag id and for changes with no flag, how many changes
recorded it and how many of those later had trouble, split by `shown` and
`confirmed`. Trouble SHALL mean a `dead` event in a task stream or a `regressed`
event in a task or change stream. Changes without a recorded `approvalFlags`
SHALL NOT be counted, and flags SHALL NOT be recomputed.

#### Scenario: Flag outcomes
- **WHEN** three changes recorded `shared_file`, two shown and one confirmed, and one shown change later has a `dead` event
- **THEN** `approvalFlags.byFlag.shared_file` reports shown fired 2 and troubled 1, and confirmed fired 1 and troubled 0

#### Scenario: Older changes
- **WHEN** a change's manifest has no `approvalFlags`
- **THEN** it contributes nothing to the section and `approvalFlags.changes` does not count it

### Requirement: Automatic retry history
<!-- source: src/core/report/report-retries.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-retries.test.ts, fixture/report/** -->
From task event streams, `osq report` SHALL count `retry` events split into
automatic and manual, how many of the attempts they opened reached `done`,
the `stuck` events, and the harness-reported cost of those attempts with the
number of attempts that reported one. An attempt opened by a retry SHALL run
from that retry until the next `retry` or the end of the stream.

#### Scenario: Automatic and manual outcomes
- **WHEN** one task has an automatic retry whose attempt reaches done at a cost of 0.10, and another has a manual retry whose attempt dies and then a `stuck` event
- **THEN** `history.retries.automatic` reports count 1, reachedDone 1, cost 0.10, and `history.retries.manual` reports count 1, reachedDone 0, with stuck 1

#### Scenario: No retries
- **WHEN** no stream holds a `retry` event
- **THEN** both groups report zero counts and cost `not reported` in text
