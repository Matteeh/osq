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

### Requirement: Manual task completion accounting
<!-- source: src/core/report.ts, tests/report.test.ts -->
The metrics and reporting subsystem SHALL distinguish manual task completions from automated verified completions in the current-state block, terminal output, and JSON data. Both counts SHALL always be present, including when zero.

#### Scenario: Reporting separates manual and verified completions
- **WHEN** `osq report` generates current state for any set of changes
- **THEN** text and JSON output present explicit verified and manual counts whose sum equals done completions

### Requirement: Execution history
<!-- source: src/core/report.ts, src/core/report/report-pre-spawn.ts, src/cli/report.ts, tests/report*.test.ts, fixture/report/** -->
Reporting SHALL derive execution history only from numbered task event files,
with task references naming change and task. History SHALL contain attempts,
multi-attempt tasks, unexplained re-runs, verification exit codes and
missing exit codes, pre-spawn verify runs, mismatches, runs with missing paths,
and runs by declared start, dead reasons, scope-regression and recertification
counts, repository size evidence, and harness-reported cost with attempt
coverage. Change-level streams and markers SHALL NOT invent task execution
history.

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

#### Scenario: Pre-spawn runs with missing paths and by declared start
- **WHEN** pre-spawn events carry `expected` values and some carry a non-empty `missingPaths`
- **THEN** `history.preSpawnVerify.missingPathRuns` counts runs with a non-empty `missingPaths`, `history.preSpawnVerify.byStart` gives `runs` and `passed` (exit code 0) for each of `red`, `green`, and `any`, and the text prints `Pre-spawn verify with missing paths: <n> of <runs> runs` and `Pre-spawn verify by declared start: red <p> of <r> passed, green <p> of <r> passed, any <p> of <r> passed`

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
<!-- source: src/core/report/planning.ts, src/core/report/planning-economics.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-planning.test.ts, tests/report-planning-economics.test.ts, tests/report-planning-unreported.test.ts, fixture/report/** -->
`osq report` SHALL expose a planning block from valid owned and observed
`.run/plan.jsonl` records across active and archived changes, keeping the
session count, wall seconds, per-change wall time, token and cost sums, usage
coverage, and planning-change count. `planning.byChange` SHALL give per change
sessions, tokens by kind, active minutes, cost, spec words, changed lines, spec
words per changed line, and minutes from last planning edit to approval.
`planning.comparison` SHALL compare planning and executor tokens and cost,
with a planning total null until a session reports that kind.

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

#### Scenario: No reported planning tokens
- **WHEN** planning sessions exist and none reported any token kind
- **THEN** `planning.comparison.planning` carries null for input, output, cached, and reasoning in `osq report --json`, and each `Planning vs execution` token line prints `planning not reported`

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

### Requirement: Scope regression history
<!-- source: src/core/report.ts, src/core/report/report-scope.ts, src/cli/report.ts, tests/report-scope-regressions.test.ts, tests/report-json.test.ts, tests/report-auto-recertification.test.ts, fixture/report/expected.json -->
The report `history` block SHALL expose
`scopeRegressions: { detected, verificationPassedAtDetection,
verificationFailedAtDetection, recertifiedByHuman, recertifiedAutomatically,
requeuedForAgent }` in text and stable JSON, with every counter present as a
non-negative integer including zero. Text SHALL print
`Recertified automatically: <n>` right after `Recertified by human: <n>`.

Counts SHALL derive only from valid typed events in numbered task streams
across active and archived changes. A `regressed` event with
`reason: scope_regression` SHALL increment detected; finite exit code zero SHALL
also increment passed at detection and a finite non-zero exit SHALL increment
failed at detection. A `recertification` event with `outcome: passed` and
`automatic: true` SHALL increment recertified automatically; one with
`outcome: passed` and no `automatic: true` SHALL increment recertified by human,
while `outcome: requeued` SHALL increment requeued for agent. Missing or
malformed outcome fields SHALL not be guessed.

Detection and recertification events SHALL NOT count as execution attempts,
multiple-attempt tasks, unexplained reruns, dead reasons, or cost coverage. A
later agent `started` event after requeue SHALL retain ordinary execution
attempt accounting.

#### Scenario: Mixed scope regression history
- **WHEN** numbered event streams contain passing, failing, legacy, and malformed scope detections plus passed and requeued recertifications
- **THEN** report counts each valid category once, retains detected coverage for legacy scope events, and leaves malformed outcome subsets unchanged

#### Scenario: No scope regression history
- **WHEN** no numbered task stream contains scope-regression or recertification events
- **THEN** text and JSON expose all six scope regression counters as zero

#### Scenario: Requeue later executes
- **WHEN** failed human recertification is followed by an agent started event
- **THEN** history counts one requeue decision and counts only the started event as the new execution attempt

#### Scenario: Automatic and human recertifications
- **WHEN** one task stream holds a passed recertification with `automatic: true` and another holds a passed recertification without it
- **THEN** `recertifiedAutomatically` is 1 and `recertifiedByHuman` is 1, in text and JSON

#### Scenario: Blocked deaths
- **WHEN** a task stream holds a `dead` event with reason `blocked`
- **THEN** `deadByReason` counts it under `blocked`

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
<!-- source: src/core/report/approval-flags.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-approval-flags.test.ts, tests/report-record-extras.test.ts, fixture/report/** -->
`osq report` SHALL read `approvalFlags` from each active and archived change's
manifest and report, per flag id and for changes with no flag, how many changes
recorded it and how many of those later had trouble, split by `shown` and
`confirmed`. Trouble SHALL mean a `dead` event in a task stream, a `regressed`
event in a task or change stream, or a later non-rejected change naming the
change in `fixes`. `approvalFlags.troubledChanges` SHALL list each troubled
change that recorded at least one flag, with its id, its flag ids, and its
trouble kinds in the order `dead`, `regressed`, `rework`, and text output SHALL
print one line per such change after the per-flag lines. Changes without a
recorded `approvalFlags` SHALL NOT be counted, and flags SHALL NOT be
recomputed.

#### Scenario: Flag outcomes
- **WHEN** three changes recorded `shared_file`, two shown and one confirmed, and one shown change later has a `dead` event
- **THEN** `approvalFlags.byFlag.shared_file` reports shown fired 2 and troubled 1, and confirmed fired 1 and troubled 0

#### Scenario: Older changes
- **WHEN** a change's manifest has no `approvalFlags`
- **THEN** it contributes nothing to the section and `approvalFlags.changes` does not count it

#### Scenario: Rework as trouble
- **WHEN** 007 recorded `removed_requirement` and `sensitive_path`, had no dead or regressed event, and 008 declares `fixes: ["007"]`
- **THEN** both flags count 007 as troubled and `troubledChanges` lists 007 with kinds `["rework"]`

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

### Requirement: Moved change approval lookup
<!-- source: src/core/report/planning-slice-lookup.ts, tests/planning-slice-archive.test.ts -->
When planning turn attribution looks up another change's approval time and that
change's folder no longer exists under the changes directory, the lookup SHALL
read the same records by folder name under `archive/`, including `<name>-<n>`
collision suffixes, preferring a folder with a recorded slice for the session
and otherwise the highest suffix. Failing that, it SHALL read
`rejected/<name>/`, where a recorded slice for the session wins and otherwise
the `timestamp` in `.run/rejected.md` closes the segment.

#### Scenario: Earlier change archived
- **WHEN** a session edited an earlier change at its active path and that change was archived before a later change's approval
- **THEN** the later change's slice equals the slice it gets with the earlier change still active, and no turn is in both changes

#### Scenario: Earlier change archived under a collision suffix
- **WHEN** the earlier change was archived as `archive/<name>-1/` because `archive/<name>/` already existed
- **THEN** the later change's slice equals the slice it gets with the earlier change still active

#### Scenario: Earlier change rejected
- **WHEN** the earlier change was rejected instead of approved and has no recorded slice
- **THEN** its rejection time closes its segment and the later change owns only turns after the rejection

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

### Requirement: Result file sections
<!-- source: src/core/report/result-sections.ts, tests/result-sections.test.ts -->
One parser in `src/core/report/result-sections.ts` SHALL read a result file's
sections. A heading SHALL match regardless of case, `#` count, surrounding
spaces, and a trailing colon, so `## deviated:` is `## Deviated` and
`## Touched:` is the `Touched:` line. A section that is empty or says only
`None`, in any case and with an optional trailing period, SHALL be absent. The
real disclosure sections of a task SHALL be `## Deviated`, `## Missing context`,
and `## Outside scope`; the parser SHALL also read every task result file of a
change into per-task disclosures. The parser SHALL also read `## Blocked` as
`blocked`, under the same matching and absence rules. `## Blocked` SHALL NOT
count as a disclosure.

#### Scenario: Heading drift
- **WHEN** a result file holds `## deviated:` with text, `## Missing context` saying `None`, and `##  Outside Scope` with text
- **THEN** the task has a deviated and an outside-scope disclosure and no missing-context disclosure

#### Scenario: Blocked section
- **WHEN** a result file holds `## blocked:` with text, and another holds `## Blocked` saying `none.`
- **THEN** the first parses with that text as `blocked`, the second with `blocked` null, and neither counts as a disclosure

### Requirement: Rework history
<!-- source: src/core/report/record-rework.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-record-extras.test.ts -->
`osq report` SHALL derive rework from the `fixes` of every active and archived
change, never rejected ones. `history.rework` SHALL list, for each change named
in some `fixes`, the change id and the sorted ids of the changes that fix it,
ordered by change id. Text output SHALL print a `Rework:` section with one
`<id>: fixed by <id>, <id>` line per entry, or `(none)`.

#### Scenario: One fix
- **WHEN** active change 002 declares `fixes: ["001"]`
- **THEN** `history.rework` holds `{ change: "001", fixedBy: ["002"] }` and the text prints `001: fixed by 002`

#### Scenario: Rejected fix
- **WHEN** the only change naming 001 in `fixes` was rejected
- **THEN** 001 has no rework entry

### Requirement: Executor disclosure counts
<!-- source: src/core/report/record-disclosures.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-record-extras.test.ts -->
`osq report` SHALL count, per active and archived change, the tasks whose result
files hold a real `## Deviated`, `## Missing context`, or `## Outside scope`
section. `history.disclosures` SHALL list only changes with at least one, as
`{ change, deviated, missingContext, outsideScope }` ordered by change id, and
text output SHALL print an `Executor disclosures:` section with one line per
listed change, or `(none)`.

#### Scenario: Counted disclosures
- **WHEN** one task of 003 has a real `## Deviated` and another has a real `## Outside scope`
- **THEN** `history.disclosures` holds `{ change: "003", deviated: 1, missingContext: 0, outsideScope: 1 }`

### Requirement: Recent executor disclosures in the plan prompt
<!-- source: src/core/report/recent-disclosures.ts, src/cli/plan.ts, src/core/foundation/config-planning.ts, tests/plan-disclosures.test.ts, tests/config-planning.test.ts -->
The plan prompt's `## Recent executor disclosures` section SHALL quote the real
disclosure sections of the `planning.disclosures.recentChanges` most recent
archived changes by numeric id, newest first and in task order, each as a
`<change> task <n>, <section>:` line followed by its text with every line
prefixed `> `. The section SHALL open with the sentence `Executor claims from
result files, not verified facts. Check them against the code before relying on
them.` Its quoted entries SHALL total at most
`planning.disclosures.maxCharacters` characters; the first entry that does not
fit SHALL be cut to fit and end with `[truncated]`, and no later entry SHALL be
included. It SHALL never include `## Changed`, `## Next`, `Touched:`, or diffs.
`recentChanges` and `maxCharacters` SHALL default to 3 and 4000 and be positive
integers.

#### Scenario: Budgeted disclosures
- **WHEN** the configured recent changes hold more disclosure text than `maxCharacters`
- **THEN** the quoted entries fit the budget, the last one ends with `[truncated]`, and no quoted line starts without `> `

#### Scenario: Invalid configuration
- **WHEN** `planning.disclosures.recentChanges` or `maxCharacters` is zero, negative, or not an integer
- **THEN** configuration loading fails naming the key

### Requirement: Planning cost estimates at report time
<!-- source: src/core/report/record-estimates.ts, src/core/report/report.ts, src/cli/report.ts, tests/report-record-extras.test.ts -->
For each planning session whose recorded slice has non-null input and output
tokens and whose exit reports no cost, `osq report` SHALL estimate a cost when
`planning.prices` has an entry for the model named by the session's
`plan_started` record, by calling `resolveSliceCost` with one turn carrying the
slice's summed tokens and that model, so a single-model session gets the number
approval would have recorded. `planning.cost.bySource` SHALL report
`harness`, `approvalPrice`, and `reportEstimate`, each with `total` and
`sessions`, where `approvalPrice` holds recorded costs whose slice says
`costSource: "price_table"`, plus `totalWithEstimates`. Text output SHALL print
each source on its own labelled line and state how much of the total is
estimated. No record SHALL be written.

#### Scenario: Estimated slice
- **WHEN** a session recorded slice tokens from `claude-opus-5-5`, no cost, and `planning.prices` prices that model
- **THEN** `bySource.reportEstimate` counts that session with the same cost `resolveSliceCost` returns for those tokens, and the text labels it as estimated from `planning.prices`

#### Scenario: No price entry
- **WHEN** such a session's model has no price entry
- **THEN** it is not estimated and its cost stays unreported

### Requirement: After-landing verification counts
<!-- source: src/core/report/record-verification.ts, src/core/report/report.ts, tests/report-verification.test.ts -->
`osq report` SHALL count archived changes that require verification by their
latest outcome as `passed`, `failed`, and `pending`, print `After-landing
checks: <passed> passed, <failed> failed, <pending> pending` in text, and carry
`history.verification: { passed, failed, pending }` in JSON. When no archived
change requires verification, it SHALL print neither.

#### Scenario: Mixed outcomes
- **WHEN** three archived changes require verification, one passed, one failed, and one without an outcome
- **THEN** the report prints `After-landing checks: 1 passed, 1 failed, 1 pending` and JSON carries the same counts

#### Scenario: No verification required
- **WHEN** no archived `archived` event carries `verification`
- **THEN** the text has no `After-landing checks` line and JSON `history` has no `verification` key

### Requirement: ADR departure flag outcomes
<!-- source: src/core/report/approval-flags.ts, tests/report-approval-flags.test.ts, fixture/report/** -->
`osq report` SHALL report `adr_departure` in `approvalFlags.byFlag` after
`verify_starts_conflict` and before `none`, counting fired and troubled
changes by handling mode exactly as it does the other flag ids.

#### Scenario: Departure counted
- **WHEN** one change recorded `adr_departure` shown and later has a `dead` event
- **THEN** `approvalFlags.byFlag.adr_departure` reports shown fired 1 and troubled 1

### Requirement: ADR check flag outcomes
<!-- source: src/core/report/approval-flags.ts, tests/report-approval-flags.test.ts, fixture/report/** -->
`osq report` SHALL report `adr_check_modified` in `approvalFlags.byFlag` after
`adr_departure` and before `none`, counting fired and troubled changes by
handling mode exactly as it does the other flag ids.

#### Scenario: Check flag counted
- **WHEN** one change recorded `adr_check_modified` shown and never had trouble
- **THEN** `approvalFlags.byFlag.adr_check_modified` reports shown fired 1 and troubled 0

### Requirement: Dependencies added per change
<!-- source: src/core/report/report-dependencies.ts, src/core/report/report.ts, src/cli/report.ts, tests/dependencies-report.test.ts -->
`osq report` SHALL list, under `history.dependencies`, each active or archived
change whose task streams hold a `dependencies_added` event, in change order,
with the distinct `{ file, name }` pairs from every such event of every
attempt, sorted by file and then name. Stable JSON SHALL omit the field when
the list is empty. Text output SHALL print a `Dependencies added:` section with
one line per change, `  <change>: <name> (<file>), ...`, only when the list
isn't empty.

#### Scenario: Two changes add packages
- **WHEN** change 012 added `zod` to `package.json` and change 013 added nothing
- **THEN** `history.dependencies` lists only 012 with `zod` in `package.json`, and text prints `  012-<slug>: zod (package.json)`

#### Scenario: No additions
- **WHEN** no stream holds a `dependencies_added` event
- **THEN** stable JSON has no `dependencies` field and text prints no `Dependencies added:` section
