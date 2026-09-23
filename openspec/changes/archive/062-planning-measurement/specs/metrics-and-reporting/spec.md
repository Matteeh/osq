# Spec Delta: Metrics and Reporting

## ADDED Requirements

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

## MODIFIED Requirements

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
