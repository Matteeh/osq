# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Focused file collection
<!-- source: src/core/run/focused-tests.ts, tests/focused-tests.test.ts -->
When `traceability.focusedTests` is set, osq SHALL collect a task's focused
scenarios and files from the scenario index, built once for the collection.
The collected scenarios are the capability and name pairs named by `scenario(...)`
calls for an opted-in capability, in scenario test files in the task's resolved
scope. The focused files are every scenario test file in the repository that
names a collected scenario, as sorted, distinct, project-relative paths. With
the command unset, no capability opted in, or no collected scenario, there is
nothing to run.

#### Scenario: Two scenarios, one outside file
- **WHEN** the task's scoped `tests/pricing-quote.test.ts` names two pricing scenarios and the unscoped `tests/pricing-bulk.test.ts` names one of them
- **THEN** the focused files are `tests/pricing-bulk.test.ts` and `tests/pricing-quote.test.ts`

#### Scenario: Capability not opted in
- **WHEN** the task's scoped test names only scenarios of a capability that isn't opted in
- **THEN** there is nothing to run

### Requirement: Focused run
<!-- source: src/core/run/focused-tests.ts, tests/focused-tests.test.ts -->
osq SHALL run the focused command with `{files}` replaced by the focused files,
each single-quoted for the shell and separated by spaces. It SHALL run through
`runVerificationCommand` with the task's change folder and the verify timeout,
so it gets the verify's environment, `OSQ_CHANGE` included. The outcome SHALL be:

- `failed` when the output has a line matching `not ok <n> - <title>`, at any
  indentation, whose title, with a trailing ` # <directive>` removed and `\#`
  and `\\` unescaped, is `Scenario: <name>` for a collected scenario's name
- `problem` when the exit code isn't 0, or the run timed out or couldn't start,
  and it isn't `failed`
- `passed` otherwise

#### Scenario: Failing scenario test
- **WHEN** the output holds `not ok 3 - Scenario: Volume discount tiers` and that scenario was collected
- **THEN** the outcome is `failed`

#### Scenario: Failure outside the scenarios
- **WHEN** the command exits 1 and its only `not ok` line names a file that failed to load
- **THEN** the outcome is `problem`

### Requirement: Focused failure ends the attempt
<!-- source: src/watcher/focused-verify.ts, src/watcher/task-verify.ts, src/harness/types.ts, tests/focused-verify.test.ts -->
After the agent exits, the watcher SHALL run the focused run as the last check
of `checkBlockedFirst`, after the missing verify path check, and only when there
is something to run. It SHALL append one `focused_ran` event with `command`,
`files`, `scenarios` as `<capability>: <name>` strings, `outcome`, `exitCode`,
`duration`, `timedOut`, and `output`.

On `failed`, the watcher SHALL kill the task with `verify_red` and not run its
verify. The dead marker's frontmatter holds `reason: verify_red`, `focused: true`,
and the quoted focused command. Its body is
`Watcher focused scenario tests failed:` followed by the output, so the next
attempt receives it as it receives verify output. On `problem` or `passed`, the
watcher SHALL run the verify as before, which alone decides the outcome.

#### Scenario: Focused pass goes on to verify
- **WHEN** the focused run passes
- **THEN** a `focused_ran` event with outcome `passed` is followed by the task's `verify_ran` event

#### Scenario: Broken focused command
- **WHEN** the focused command is `node missing-runner.js {files}`
- **THEN** a `focused_ran` event with outcome `problem` is recorded and the verify still decides the task

#### Scenario: Unset command
- **WHEN** `traceability.focusedTests` is unset
- **THEN** no `focused_ran` event is appended and the task runs exactly as before
