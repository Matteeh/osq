# Spec Delta: Metrics and Reporting

## MODIFIED Requirements

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
