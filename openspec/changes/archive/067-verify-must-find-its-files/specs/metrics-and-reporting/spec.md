# Spec Delta: Metrics and Reporting

## MODIFIED Requirements

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
