---
title: Repository record in planning
depends_on: ["039"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - metrics-and-reporting
---
## Goal

Turn local task measures and outcomes into trustworthy size evidence in
`osq report`, then feed a bounded record from recent archived changes into every
planner opening prompt so task sizing can improve without automatically
changing lint limits.

## Verify

`pnpm verify`

The suite includes a local fixture with measured tasks in three size buckets.
It asserts the stable JSON history shape, the text size table and near-limit
hint, and the fifth section emitted by `osq plan --print`. It requires no
authentication, network access, model, or TTY.

## Non-goals

- Editing `PLANNER.md` or changing any configured limit automatically.
- Per-model comparisons, new measures fields, result-text analysis, or diff analysis.
- Estimating missing measures, outcomes, attempts, durations, or failure reasons.
- Sending repository history, prompts, task content, or telemetry off the machine.
- Changing task execution, retry, verification, archive, or queue behavior.

## Contract

### Requirement: Repository task-size outcome history

The report `history` block SHALL expose `sizes` derived from task files and
append-only numbered task event streams across the report's active and archived
changes. Only tasks with a valid first `measures` event whose phase is `start`
SHALL contribute. The first valid start measure SHALL supply `scopeFiles`; the
task's parsed acceptance checklist SHALL supply `acceptanceLines`.

Sizes SHALL be bucketed independently by scope files and acceptance lines using
the ordered labels `1-2`, `3-4`, `5-8`, and `over-8`. Each bucket SHALL contain
task count, first-attempt pass rate, mean attempts, and nullable median duration
seconds. Attempts and pass outcomes SHALL come only from typed task events.
Duration SHALL sum each task's valid non-negative paired start-to-end measures
intervals, remain unavailable when none is complete, and never use filesystem
timestamps.

History SHALL also expose the single first-attempt pass with the greatest
`scopeFiles`, including change id, task number and title, scope files, and
acceptance lines. Ties SHALL prefer more acceptance lines and then stable
change/task order. Text output SHALL render the two size tables and exactly one
hint line when that task's observed scope or acceptance size is no more than
one away from the corresponding configured limit. The line SHALL name every
matching limit, configured value, and observed size without changing config.

The same reporting code SHALL derive a repository record from at most the 20
most recent archived changes by numeric change id. It SHALL contain measured
task count, first-attempt pass rate, median task duration, the largest
first-attempt pass, and at most ten dead-event rows containing change id, task
title, and recorded reason. Missing or empty reasons SHALL be `unknown`.
Neither derivation SHALL read result files or diffs.

#### Scenario: Measured tasks span size buckets
- **WHEN** valid measures and task outcome events exist in three or more size buckets
- **THEN** report JSON and text contain deterministic per-bucket task counts, first-attempt pass rates, mean attempts, median durations, and the largest passing task

#### Scenario: Largest passing task is near configured limits
- **WHEN** the largest first-attempt pass has scope or acceptance size within one of its configured limit
- **THEN** text reporting prints one evidence-only hint naming each matching limit, its configured value, and observed size

#### Scenario: Recent archived record
- **WHEN** archived changes contain measured tasks and dead events
- **THEN** shared report derivation returns the bounded aggregate and outcome-only repository record without reading results or diffs

### Requirement: Repository record in the planning prompt

`osq plan` SHALL append a fifth ordered section named
`This repository's record` after the complete brief. The section SHALL be
formatted from the shared report derivation over the 20 most recent archived
changes and SHALL contain only first-attempt pass rate, up to ten `change, task
title, reason` dead-event lines, the largest first-attempt pass with scope-file
and acceptance-line sizes, and median task duration.

When fewer than five tasks in that archive window have valid start measures,
the section SHALL contain exactly `This repository's measured record is too
small (fewer than 5 tasks).` after its heading and stop without printing partial
aggregates or outcome rows. Ordinary new planning, resumed planning,
queue-selected planning, interactive launch, and print mode SHALL use the same
five-section prompt.

#### Scenario: Sufficient repository record
- **WHEN** at least five measured tasks exist in the recent archive window
- **THEN** interactive and printed prompts place the complete bounded repository record after the brief

#### Scenario: Repository record is too small
- **WHEN** fewer than five measured tasks exist in the recent archive window
- **THEN** the fifth section contains only the too-small explanation after its heading

#### Scenario: Print mode review
- **WHEN** a user executes `osq plan --print`
- **THEN** stdout contains the same fifth section an interactive planner would receive without spawning a planner or recording a planning session

## Human steps

- Let dependency 039 finish and archive before approving or executing this change.
- After reviewing these task bodies and deltas, run `pnpm osq approve 040` yourself. Neither planner nor executor approves the change.
- Treat any near-limit hint as evidence only; decide any later `limits` change separately.

## Delta

- `specs/metrics-and-reporting/spec.md`: measured size/outcome buckets, largest first-attempt pass, near-limit hint, and shared recent repository-record derivation.
- `specs/cli-foundation/spec.md`: the fifth planner prompt section and its too-small and print-mode behavior.
