---
title: A blocked exit and automatic recertification
depends_on: ["074"]
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - metrics-and-reporting
    - status-inspection
    - cli-foundation
    - spec-lint-and-approve
---
## Goal

Two stops that don't need a human no longer wait for one. An executor that
can't finish within its scope says so and states what it needs, and the
watcher records the task dead with reason `blocked` instead of retrying the
same attempt. When a later task was allowed to change a file an earlier task
finished with, the watcher recertifies the earlier task itself, but only when
the recorded hashes show nothing else touched the file and the earlier task's
verify still passes. Covers roadmap items 2.5 and 2.8.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New tests on temporary
projects prove that:

- a fake agent that writes `## Blocked` and no code dies with `blocked`, isn't
  retried automatically, and the inbox shows its stated need
- a result file whose `## Blocked` says only `None` behaves as today
- when task 2 changes a file task 1 finished with, task 2's scope covers the
  file, and the hash chain is intact, task 1 is recertified automatically when
  its verify passes, and no regression marker is written
- the same setup halts as today when task 1's verify fails
- a human edit between the tasks breaks the chain, and the change halts as today
- a changed file outside every later task's scope halts as today
- `osq report` counts `blocked` deaths and automatic recertifications apart
  from human ones

## Non-goals

- Scope detection across the whole repository. The `measures` hash chain is
  enough here.
- Recertifying across changes.
- Amendments for blocked tasks.
- Showing automatic recertifications apart in the web report or `osq show`.

## Surface

- Added: `## Blocked` (result file heading), and new wording for step 2 of the executor protocol in `AGENTS.md`
- Added: `blocked` (dead reason), not eligible for an automatic retry
- Added: `automatic: true` on the `recertification` event (event data)
- Added: `blocked` on a `task-dead` inbox item, whose command becomes `osq reject <id> --reason <text>` (inbox JSON)
- Added: `history.scopeRegressions.recertifiedAutomatically` and the `Recertified automatically:` report line (report field)
- Changed: `PLANNER.md` no longer tells planners to list an expected `osq retry` for a shared file (planner guidance)

## Background

Step 2 of the executor protocol in `AGENTS.md`, `EXECUTOR_STEPS` in
`src/core/foundation/init-blocks.ts`, tells an executor that finds its task
too big to write why in its result file and exit without code. The verify then
fails, and the watcher records `verify_red`, a reason that
`ELIGIBLE_AUTO_RETRY_REASONS` in `src/watcher/auto-retry.ts` retries
automatically. So an executor that stopped honestly gets another attempt under
the same pressure that produced the ts-paas 007 shim. `blocked` is not on that
list, so leaving it off keeps the new reason from being retried; `auto-retry.ts`
needs no change.

`parseResultSections` in `src/core/report/result-sections.ts` (change 074)
reads result file sections, and the executor's result headings are in
`RESULT_HEADINGS` in `init-blocks.ts`. In `runTask` (`src/watcher/runner.ts`),
after the agent exits, `ensureTaskResult` makes sure a result file exists and
`checkMissingVerifyPaths` from `src/watcher/task-verify.ts` runs before the task
verify.

`auditScopeRegressions` in `src/watcher/regression.ts` runs before every task
and again before archive. It finds done tasks whose scoped files changed, runs
each one's verify, and writes a regression marker, which halts the change until
`osq retry` recertifies the task. In osq's own history all 18 scope regressions
had a green verify at detection, and 17 still needed a manual retry. Every
task's `measures` end event records each scoped file's `before` and `after`
hash, and the done marker's `scope_files` records the hashes the task finished
with. `retrySpec` in `src/core/lifecycle/retry.ts` recertifies a passing task
by rewriting the done marker in place and appending a `recertification` event
with `outcome: passed`. This change moves that done-marker rewrite into a shared
function, so `osq retry` and the watcher both use it.

`PLANNER.md` tells planners who share a file between tasks to list the expected
`osq retry` under `## Human steps`. On ts-paas, planners avoided sharing files by
packing every subcommand into one task.

Line budgets: `runner.ts` is 199 lines and `outcome.ts` 196, and both must stay
under 200 (`tests/import-graph.test.ts`). `regression.ts` is 246,
`retry.ts` 246, `report-events.ts` 248, and `inbox.ts` 243, and each must stay
within 250. `observeTaskStream` in `report-events.ts` is 79 lines, and the limit
is 80. So the blocked check and the recertification decision go in new modules
under `src/watcher/`, and the scope counters in the report get their own
module.

## Contract

### Requirement: Blocked exit
After the agent exits, a result file with a real `## Blocked` section SHALL make
the task die with reason `blocked`, and the verify SHALL NOT run. `blocked`
SHALL NOT be eligible for an automatic retry.

#### Scenario: Executor stops blocked
- **WHEN** a fake agent writes a result file whose `## Blocked` states a need, and no code
- **THEN** the task dies with `blocked`, its verify doesn't run, and no automatic `retry` follows

### Requirement: Automatic scope recertification
A done task whose scoped file changed SHALL be recertified without a human only
when a later task in the same change has that file in its approved scope, the
hashes that later task recorded carry the file from the done task's hash to the
current one without a gap, and the done task's verify passes at detection.
Anything else SHALL halt as today.

#### Scenario: A later task extends the file
- **WHEN** task 2's scope covers `src/a.ts`, which task 1 finished with, task 2 changed it, and task 1's verify still passes
- **THEN** task 1 is recertified with a `recertification` event carrying `automatic: true`, and no regression marker is written

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/cli-foundation/spec.md`: modifies "Executor protocol constants and
  result headings" and "Planner protocol rules in documentation and templates".
- `specs/watcher-and-harness/spec.md`: adds "Blocked exit" and "Automatic scope
  recertification"; modifies "Scope recertification audit" and "Scope
  recertification lifecycle event".
- `specs/status-inspection/spec.md`: adds "Blocked inbox items"; modifies
  "Action command contract".
- `specs/metrics-and-reporting/spec.md`: modifies "Result file sections" and
  "Scope regression history".

Five tasks, and no two share a file. Task 1 owns the root `*.md` files, so the
README's gate descriptions change there too. Task 2 adds the `blocked` field to
`parseResultSections`, which task 3 reads. Task 4 adds `automatic` to the
`recertification` event, which task 5 counts.
