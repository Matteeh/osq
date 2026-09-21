---
title: Report current state and execution history separately
depends_on: []
verify: pnpm verify && pnpm build && (cd fixture/report && node ../../dist/cli/bin.js report --json) | diff -u fixture/report/expected.json -
features:
  reads:
    - metrics-and-reporting
---
## Goal

Make `osq report` distinguish current task state from historical execution events, expose missing event coverage, and make attempt and cost data auditable.

## Verify

`pnpm verify && pnpm build && (cd fixture/report && node ../../dist/cli/bin.js report --json) | diff -u fixture/report/expected.json -`

## Non-goals

- New event types or changes to event or manifest schemas.
- Planning metrics or cycle-time analysis.
- Changes to `osq status` or `osq show`.
- Cost estimation when a harness did not report cost.
- Repairing or synthesizing missing historical event files.

## Contract

### Requirement: Current state comes only from markers

`osq report` SHALL expose a `now` block containing total, done, verified, manual, dead, regressed, running, and pending task counts. Current state SHALL be derived from marker files for active and archived changes, without terminal events overriding marker state. Done-marker frontmatter SHALL continue to distinguish manual completion from verified completion.

#### Scenario: Zero completion subtypes
- **WHEN** no task has a manual or verified completion
- **THEN** JSON and text output include explicit zero values for both `verified` and `manual`

#### Scenario: Current and historical failure differ
- **WHEN** a task has a historical dead event but its current marker is done
- **THEN** `now.dead` excludes it while history retains the dead event

#### Scenario: Regressed marker
- **WHEN** a task has a regressed marker
- **THEN** `now.regressed` counts it separately from dead, running, and pending

### Requirement: History comes only from events

`osq report` SHALL expose a `history` block derived only from task event files. It SHALL report total attempts, attempts for every task, tasks with more than one attempt, dead events grouped by reason, unexplained re-runs, verification runs and exit codes, verification runs lacking an exit code, and harness-reported cost with attempt coverage.

Task identities in history SHALL include both change identifier and task number.

#### Scenario: Attempt accounting
- **WHEN** task event streams contain `started` events
- **THEN** every `started` event counts as one attempt, totals equal the sum of per-task attempts, and tasks with more than one attempt are identified

#### Scenario: Re-run without recorded reason
- **WHEN** a task has another `started` event without an intervening `dead` or `regressed` event
- **THEN** history counts that transition as an unexplained re-run and identifies the task

#### Scenario: Historical dead reasons
- **WHEN** event streams contain dead events
- **THEN** every dead event is counted under its recorded reason, with absent reasons grouped as `unknown`, without falling back to dead markers

#### Scenario: Verification history
- **WHEN** event streams contain `verify_ran` events
- **THEN** history records their task identity and numeric exit code or an explicit missing value, and reports how many lack an exit code

#### Scenario: Cost provenance and coverage
- **WHEN** finite cost values occur within recorded attempts
- **THEN** their existing total and per-change aggregation are retained under history, provenance is identified as harness-reported, and coverage states `n of m attempts reported cost`

#### Scenario: No reported cost
- **WHEN** no attempt carries a cost value
- **THEN** history reports zero harness-reported cost and `0 of m attempts reported cost` without estimating cost

### Requirement: Event-file coverage is explicit

`osq report` SHALL expose a `coverage` block that accounts for every discovered task and identifies whether its `.run/events/<n>.jsonl` file exists.

#### Scenario: Mixed historical coverage
- **WHEN** some tasks have event files and others do not
- **THEN** coverage reports totals with and without event files and groups both task sets by change identifier

### Requirement: Report rendering and JSON structure

The text renderer SHALL print sections named `Now`, `History`, and `Coverage`. JSON SHALL expose the same information under top-level `now`, `history`, and `coverage` keys.

The requested grouping replaces the former top-level `tasks`, `failureBreakdown`, and `cost` fields. Existing unrelated top-level fields and their nested shapes—`specs`, `completionRate`, `durations`, `tokens`, and `fileChanges`—SHALL remain unchanged.

#### Scenario: Deterministic fixture report
- **WHEN** the built CLI runs `report --json` against the checked-in report fixture
- **THEN** its deterministically sorted output matches the checked-in expected JSON byte for byte

#### Scenario: Edge-case fixture
- **WHEN** report tests inspect the fixture
- **THEN** it contains a task without an events file, a task with two `started` events and no intervening dead or regressed event, and a task with a dead event

#### Scenario: Existing event behavior
- **WHEN** the report and golden-event test suites run
- **THEN** existing token, duration, file-change, event-generation, and JSON determinism behavior continues to pass

## Human steps

- Review this change, then run `pnpm osq approve 034` yourself. Neither planner nor executor approves it.

## Delta

- `specs/metrics-and-reporting/spec.md`: marker-only current state, event-only execution history, event-file coverage, cost coverage, and the revised text and JSON report structure.
