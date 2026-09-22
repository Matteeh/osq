# Spec Delta: Metrics and Reporting

## ADDED Requirements

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

## MODIFIED Requirements

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
