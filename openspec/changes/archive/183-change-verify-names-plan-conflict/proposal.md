---
title: A change verify that fails only on an earlier task's tests ends the task as blocked and names the plan conflict
depends_on: []
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - spec-lint-and-approve
---
## Goal

When a task's change-level verify fails only on tests that an earlier, done
task of the same change owns, osq treats it as a plan conflict, not a bad
attempt. The task dies `blocked` at once and is not retried automatically.
Its dead marker names each failing test, the task that owns it, and
`osq plan <id>`, so no attempt is wasted and nobody has to read the result
file to find out why.

In 173, task 3 added a lint error that rejected the approvals task 1's tests
make. The change verify failed with `change_verify_red`, the watcher retried
the task automatically, and only attempt 2 ended `blocked` with the
explanation.

## Verify

`pnpm verify`

The CLI and UI typechecks, the build, every test and lint pass on the final
tree, including the new `tests/change-verify-plan-conflict.test.ts`.

## Non-goals

- Detecting the conflict at plan or lint time; that needs the validator.
- Changing what counts as an unrelated failure for reruns. Reruns run first, exactly as today.
- Changing the task's own verify, the baseline, or archive-time verifies.
- Changing the auto-retry list. `change_verify_red` stays on it; a plan conflict simply dies with `blocked`, which is not on it.

## Surface

None

## Decisions

- ADR 002: archive's delta application is untouched.
- ADR 010: the validator role is untouched.
- ADR 012: the watch service is untouched.

## Assumptions

- A real bug in the current task that breaks an earlier task's tests also ends as `blocked` instead of getting one automatic retry. The marker names the tests and their owner either way, and the human or planner chooses between `osq retry` and `osq plan`.
- A "done task" is any task of the change with a done marker under `.run/done/`. Tasks run in order, so a done task is an earlier one.
- Measured on 2026-10-12: a prototype of this check in a scratch tree passed the full test suite (3888 pass, 0 fail), so no existing test pins `change_verify_red` for a failure that an earlier done task owns.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/watcher-and-harness/spec.md`: ADDED "Plan conflict at change verify"; MODIFIED "Change verify rerun after unrelated failures", whose red end now defers to it.

No file is shared between tasks.
