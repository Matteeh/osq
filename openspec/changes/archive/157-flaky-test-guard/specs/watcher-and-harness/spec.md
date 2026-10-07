## ADDED Requirements

### Requirement: Failing test files in verify output
`readFailingTestFiles` in `src/core/run/failing-tests.ts` SHALL read the
failing test files a verify run's output names. It SHALL look only at the lines
after the last line that starts with `✖ failing tests:` after leading
whitespace, and read each line of the form `test at <path>:<line>:<column>`,
after leading whitespace, as `<path>`. A `<path>` given as a `file://` URL or
as an absolute path SHALL be read relative to the project root, as a POSIX
path. The result SHALL be the distinct paths, sorted, or null when the output
has no such section or the section names no file.

#### Scenario: Paths read from the failing-tests section
- **WHEN** a run's output, from project root `/repo`, holds the line `✖ failing tests:` followed by each line below
- **THEN** each line reads as the path shown

| line after `✖ failing tests:` | read as |
| --- | --- |
| `test at tests/inbox.test.ts:2:14782` | `tests/inbox.test.ts` |
| `test at file:///repo/tests/report.test.ts:1:1966` | `tests/report.test.ts` |
| `test at /repo/tests/watch.test.ts:7:7902` | `tests/watch.test.ts` |
| `✖ reads the inbox (3148.737208ms)` | nothing |
| `    at TestContext.<anonymous> (tests/inbox.test.ts:571:14)` | nothing |

#### Scenario: No failing-tests section
- **WHEN** a run's output has no line starting with `✖ failing tests:`, or that section has no `test at` line
- **THEN** `readFailingTestFiles` returns null

#### Scenario: Lines before the section are ignored
- **WHEN** a `test at tests/early.test.ts:1:1` line comes before the last `✖ failing tests:` line, and only `test at tests/late.test.ts:1:1` follows it
- **THEN** the result is `["tests/late.test.ts"]`

### Requirement: Change verify rerun after unrelated failures
When the change-level verify fails after a task's verify passed, the runner
SHALL decide whether the failures are unrelated to the task. They are
unrelated only when the run did not time out, `readFailingTestFiles` reads at
least one failing test file from its output, and every failing test file:

- is under `tests/` and existed with the same content in the test snapshot
  the runner took before the agent spawned,
- is not in the task's resolved scope, and
- imports no existing file in the task's resolved scope, at any depth of the
  relative import graph `buildImportGraph` builds with the OpenSpec root
  left out.

When the failures are unrelated and fewer than `gates.changeVerifyReruns`
reruns have been spent at this task boundary, the runner SHALL run the
change-level verify again, recording its `verify_ran` event as every
change-level run does. It SHALL then append one `change_verify_rerun` event to
the task's own stream, `.run/events/<n>.jsonl`, with data
`{ rerun, tests, passed }`: `rerun` is the 1-based rerun number, `tests` the
failing test files of the run it repeats, and `passed` whether the rerun
passed. A rerun that fails is judged again by the same rule before the next
rerun.

A passing rerun SHALL let the task reach done exactly as if the first run had
passed. Otherwise the task SHALL die with `change_verify_red` as before, with
its dead marker built from the last run. The task's own verify, the baseline,
and the archive-time verifies are never rerun.

#### Scenario: Unrelated failure passes on rerun
- **WHEN** the change-level verify first fails naming only `tests/other.test.ts`, a preexisting test the agent left unchanged that imports nothing in the task's scope, and passes when run again
- **THEN** the task reaches done, the task's stream holds one `change_verify_rerun` event with `{ rerun: 1, tests: ["tests/other.test.ts"], passed: true }`, and the change stream holds two change-level `verify_ran` events

#### Scenario: Rerun fails too
- **WHEN** the change-level verify fails twice naming only `tests/other.test.ts`, under the default `gates.changeVerifyReruns` of 1
- **THEN** the task dies with `change_verify_red`, its dead marker holds the second run's excerpt, and the task's stream holds one `change_verify_rerun` event with `passed: false`

#### Scenario: Failures that touch the task
- **WHEN** the change-level verify fails once with each condition below
- **THEN** the runner reruns it or not as shown

| condition | rerun |
| --- | --- |
| the failing test is preexisting, unchanged, outside scope, and imports nothing in scope | yes |
| the failing test imports a scoped file through another file | no |
| the failing test is in the task's scope | no |
| the agent created the failing test | no |
| the agent changed the failing test | no |
| the failing test is outside `tests/` | no |
| one of two failing tests imports a scoped file | no |
| the output names no failing test | no |
| the run timed out | no |

#### Scenario: No rerun leaves today's behavior
- **WHEN** the runner does not rerun a failing change-level verify
- **THEN** the task dies with `change_verify_red`, the change stream holds one change-level `verify_ran` event for this boundary, and the task's stream holds no `change_verify_rerun` event

#### Scenario: Reruns turned off
- **WHEN** `gates.changeVerifyReruns` is 0 and the change-level verify fails naming only an unrelated test
- **THEN** the task dies with `change_verify_red` without a rerun

#### Scenario: Two reruns
- **WHEN** `gates.changeVerifyReruns` is 2 and the change-level verify fails twice naming only `tests/other.test.ts`, then passes
- **THEN** the task reaches done and its stream holds two `change_verify_rerun` events, `{ rerun: 1, passed: false }` and `{ rerun: 2, passed: true }`, each with `tests: ["tests/other.test.ts"]`
