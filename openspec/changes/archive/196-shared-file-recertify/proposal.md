---
title: A planned shared file recertifies its owner on every harness, and a passing scope regression offers retry
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
    - version-control
---
## Goal

PLANNER.md promises that when a later task extends a file an earlier done task
owns, and has that file in its scope, the watcher recertifies the earlier task
by itself when its verify still passes. In 192 that did not happen: task 4
shared `ChangeView.tsx` with task 3, task 3's verify passed, and the change
halted with `scope_regression`.

The brief traced this to opencode's missing `file_changed` events. Planning
found a different cause. Automatic recertification does not read
`file_changed` at all. It follows the file through the later task's `measures`
end events. Task 4's first attempt died with `scope_violation`, and the worktree
discarded its edits, but its end event (`be20…` to `2f06…`) stayed in the
stream. The retry's end event starts again from `be20…`, so the chain had a gap
and the audit refused. A test that replays 192 under the current code fails
the same way, and passes once the discarded attempt's segment is dropped.

So this change:

- drops a discarded attempt's `measures` segment before the chain check, so
  a retried later task no longer breaks the owner's automatic recertification;
- credits a differing path from those same measured hashes when no
  `file_changed` event names it, records `source: "measures"` on that
  attribution entry, and keeps a typed event first;
- stops treating a `scope_regression` whose recorded verify passed as a
  steering trigger, so its next step, the inbox and dispatch offer
  `osq retry <id> <n>` (which recertifies in place) instead of `osq plan <id>`;
- adds a `recertifications` table to `osq query` to count credit sources.

## Verify

`pnpm verify`

It runs both typechecks, the build, every test and lint on the final tree. That
includes the new `tests/shared-file-recertify.test.ts`,
`tests/scope-credit.test.ts`, `tests/scope-regression-retry.test.ts` and
`tests/query-recertifications.test.ts`, plus the line and function budget
tests over the changed modules.

## Non-goals

- Adding `file_changed` events to the opencode or agy adapters.
- Changing what a scope violation is, or the git guard.
- Recertifying automatically when a path is `ambiguous` or `unknown`. Those
  still halt; when the owner's verify passed, the human taps `osq retry`.
- Showing the credit source in `osq show`. The marker and events carry it;
  `osq show` prints attribution as today.

## Surface

- Added: `source: "measures"` key on a scope attribution entry credited from measured hashes, in `regressed` and `recertification` events and `.run/regressed/<n>.md`
- Added: `recertifications(change, task, recertified_at, outcome, automatic, path, credited_to, source)` (`osq query` table)
- Changed: a task `scope_regression` marker with `verification_passed: true` is no longer a `regression` steering trigger; its next step reads `dead — osq retry <id> <n>` instead of `dead (needs steering) — osq plan <id>`

## Decisions

- ADR 002: archive and delta application are not touched.
- ADR 008: `recertifications` is built from the event files on every `osq query` call and stored nowhere.
- ADR 010: the validator is not touched.
- ADR 012: the watch service is not touched; the credit comes from files, so it survives a watcher restart.
- ADR 018: a passing scope regression no longer starts the automatic planner, because it is no steering trigger; every other trigger is unchanged.
- ADR 019: a tapped planner refuses a change with only a passing scope regression, as it refuses any change without steering.

## Assumptions

- In a worktree, a dead attempt's edits outside the change folder are discarded (`commitDeadTask`), so the next attempt's first `measures` `before` equals the dead attempt's `before`. Without version control the edits stay, the next `before` equals the dead `after`, and the chain is unchanged.
- A later task's `measures` end events hold hashes only for files in its own resolved scope, so a measured credit always names a task whose scope covered the path when it ran.
- No golden event fixture changes. Neither the verified flow nor the dead flow writes a `regressed` or `recertification` event.
- Existing tests that pin the full `osq query` table list need the `recertifications` line: `tests/query-command.test.ts`, `tests/query-trial-tables.test.ts`, `tests/query-tables.test.ts` and `tests/query-pauses.test.ts` (whose "Pauses listed" case says `pauses` is last). Measured on a prototype of the whole change: these four fail and nothing else does. Task 3 sets `tests.modify` for them.

## Contract

The watcher-and-harness, status-inspection and metrics-and-reporting deltas
below are the contract.

## Human steps

### Before approval

None

### After landing

- Restart the watcher so it runs the new build.
- Update the Notion "Gap: shared files never recertify under opencode" page and its Bugs and incidents row: the cause was the discarded attempt's segment, fixed in 196.

## Delta

- `specs/watcher-and-harness/spec.md`: MODIFIED "Automatic scope recertification" and "Scope recertification audit" (task 1).
- `specs/status-inspection/spec.md`: MODIFIED "Steering triggers" and "Next step commands" (task 2).
- `specs/metrics-and-reporting/spec.md`: ADDED "Recertification query table", MODIFIED "Pause query table" (task 3).

No file is shared between tasks.
