# Spec Delta: Metrics and Reporting

## MODIFIED Requirements

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

## ADDED Requirements

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
