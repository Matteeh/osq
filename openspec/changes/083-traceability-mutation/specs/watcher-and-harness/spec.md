# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Mutation command
<!-- source: src/core/run/mutation-run.ts, src/core/run/verification.ts, tests/mutation-run.test.ts -->
osq SHALL run the mutation command once per pick, through
`runVerificationCommand` with the change folder, so the command also gets
`OSQ_CHANGE`. It SHALL set:

- `{mutate}` and `OSQ_MUTATE`: the pick's ranges, comma-joined for the
  placeholder and as a JSON array for the variable
- `{tests}` and `OSQ_MUTATION_TESTS`: the pick's tests, single-quoted for the
  shell and space-separated for the placeholder, and as a JSON array for the
  variable
- `{report}` and `OSQ_MUTATION_REPORT`: an absolute path in a fresh temporary
  folder, single-quoted for the placeholder

`runVerificationCommand` SHALL take an optional record of extra environment
variables for this. The temporary folder SHALL be removed after the report is
read.

#### Scenario: Placeholders and environment
- **WHEN** the command is `node fake-mutate.cjs {mutate} {tests} {report}` for a pick of `quote`
- **THEN** the command receives `src/pricing/quote.ts:20-24,src/pricing/quote.ts:33-39`, `'tests/pricing-quote.test.ts'`, and the report path, and the same values in the three environment variables

### Requirement: Mutation report reading
<!-- source: src/core/run/mutation-report.ts, tests/mutation-run.test.ts -->
osq SHALL treat the report as untrusted JSON and read only
`files[<file>].mutants[]`, and from each mutant `status`, `mutatorName`,
`replacement`, and `location.start.line` and `column`. It SHALL count only
mutants of the pick's file whose start line falls in one of its ranges:

- `Killed` and `Timeout` count as killed.
- `Survived` and `NoCoverage` count as survived.
- Any other status, or a mutant with a missing or mistyped field, counts as
  invalid.

Each survivor SHALL keep its file, line, column, mutator, and replacement, the
replacement cut to 200 characters. A report that is missing, isn't JSON, or
has no `files` object SHALL make the pick not measured with reason
`report_invalid`.

#### Scenario: Survivor recorded
- **WHEN** the report holds 18 killed mutants and one `Survived` `ConditionalExpression` at line 36, column 19, replaced with `false`
- **THEN** the pick records 18 killed, 1 survived, and that survivor

#### Scenario: Mutant outside the ranges
- **WHEN** the report holds a surviving mutant at line 5 of the same file
- **THEN** it isn't counted

### Requirement: Mutation check after a pass
<!-- source: src/watcher/mutation-check.ts, src/watcher/loop.ts, src/harness/types.ts, tests/mutation-check.test.ts -->
When `traceability.mutation` is set and at least one capability is opted in,
`runWatcherCycle` SHALL run the mutation check right after `runTask` returns
success, before the change can archive. The check SHALL run the picks in
order, under `budgetSeconds` of total wall time for the task. Each run's
timeout is the budget left. The check SHALL append one `mutation_ran` event per
pick to the task's stream, with `file`, `function`, `ranges`, `scenarios`,
`tests`, `outcome`, `killed`, `survived`, `invalid`, `survivors`, `duration`,
and `exitCode`. The outcome is `measured` or `not_measured`, and a not-measured
event also has `reason`: `range_unknown`, `budget`, `timed_out`,
`command_failed`, or `report_invalid`. A `command_failed` or `timed_out` event
also has the command's output cut to its last 2,000 characters.

A pick whose ranges are unknown SHALL be recorded as `range_unknown` without
running. Picks left once the budget is spent SHALL be recorded as `budget`
without running. A nonzero exit is `command_failed`. The check SHALL catch
every error it meets, log it, and return. It never changes the task's done
state, markers, or retries.

#### Scenario: Budget runs out
- **WHEN** `budgetSeconds` is 1 and the first of two picks takes longer
- **THEN** the first is recorded as `timed_out`, the second as `budget`, and the task stays done

#### Scenario: Mutation unset
- **WHEN** `traceability.mutation` is unset
- **THEN** no mutation command runs and no `mutation_ran` event is appended
