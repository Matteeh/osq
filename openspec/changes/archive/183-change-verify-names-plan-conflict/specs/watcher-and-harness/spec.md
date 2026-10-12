## ADDED Requirements

### Requirement: Plan conflict at change verify
When a task's change-level verify is still red after any reruns, the runner
SHALL call `findPlanConflict` in `src/watcher/plan-conflict.ts`. It finds a
plan conflict only when the last run did not time out, `readFailingTestFiles`
reads at least one failing test file from its output, and every failing test
file is outside the task's own resolved scope and owned by another task of
the same change that has a done marker under `.run/done/`. A done task owns
a file when the file is in its resolved scope, read from its `tasks/<n>.md`,
or is listed on the `Touched:` line of its `.run/results/<n>.md`, split on
commas and trimmed. When several done tasks own a file, the lowest task
number is named.

On a plan conflict the task SHALL die with reason `blocked`, not
`change_verify_red`, and one `dead` event SHALL record `blocked`. As "Blocked
exit" says, it is then not retried automatically. Its dead marker SHALL be:

```
---
reason: blocked
command: "<change verify command>"
exit_code: <exit code>
---
Change-level verification failed only on tests that earlier done tasks own, so this task conflicts with the plan:
- <test file> (task <owner>)
Revise the plan with osq plan <id>, then approve it again.
<verify excerpt>
```

with one `- ` line per failing test file in sorted order, `<id>` the change's
numeric prefix, and the excerpt built as for `change_verify_red`. In every
other case the task SHALL die with `change_verify_red` as before.

#### Scenario: Failing tests owned by an earlier task
- **WHEN** task 1 of change `007-x` has a done marker, task 2 runs with scope `src/two.ts`, its own verify passes, and the change-level verify keeps failing as the row says
- **THEN** task 2 dies with the reason the row names:

| failing tests | how they are owned | reason |
| --- | --- | --- |
| `tests/a.test.ts` | in task 1's scope | `blocked` |
| `tests/b.test.ts` | on task 1's `Touched:` line only | `blocked` |
| `tests/a.test.ts` | in task 1's scope, but task 1 has no done marker | `change_verify_red` |
| `tests/a.test.ts`, `tests/c.test.ts` | `tests/a.test.ts` in task 1's scope, `tests/c.test.ts` owned by no task | `change_verify_red` |
| `tests/a.test.ts` | in task 1's scope and in task 2's scope | `change_verify_red` |
| none named | no failing-tests section in the output | `change_verify_red` |
| `tests/a.test.ts`, run timed out | in task 1's scope | `change_verify_red` |

#### Scenario: Plan conflict marker
- **WHEN** task 2 of change `007-x` dies `blocked` because the change-level verify `node change-verify.cjs` exits 1 naming only `tests/a.test.ts`, which is in done task 1's scope
- **THEN** the dead marker has `reason: blocked`, `command: "node change-verify.cjs"` and `exit_code: 1`, its body holds `- tests/a.test.ts (task 1)` and `osq plan 007`, followed by the verify excerpt, and the task's stream holds one `dead` event with reason `blocked`

## MODIFIED Requirements

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
passed. Otherwise the task SHALL die as "Plan conflict at change verify"
says: with `blocked` when the last run's failing tests are a plan conflict,
and with `change_verify_red` as before in every other case, with its dead
marker built from the last run. The task's own verify, the baseline, and the
archive-time verifies are never rerun.

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
