---
queue_item: change-verify-names-plan-conflict
queue_hash: sha256:f523fa0438ae277c5cec7a8215005471d2ffaa2c4f075394d9fce981a76ee92b
planner: null
date: 2026-10-12
---

### Goal

When a task's change-level verify fails only on tests that an earlier, done task wrote, osq sees a plan conflict, not a bad attempt. It ends the task as `blocked` at once, names each test and the task that owns it, and points to `osq plan <id>`, so no attempt is wasted and nobody has to read the result file to find out why.

### Context

As of 2026-10-12:

- In 173, task 3 added a lint error that rejected the approvals task 1's tests make. The change verify failed (`change_verify_red`), the task was retried automatically, and attempt 2 ended `blocked` with the explanation. Bugs row "Later task's lint rejects approvals an earlier task's tests make".
- `runChangeVerifyGate` in `src/watcher/change-verify.ts` reruns unrelated failures (157, `findUnrelatedFailingTests` in `src/watcher/change-verify-rerun.ts`) but never asks who owns a failing test. `change_verify_red` is on the auto-retry list in `src/watcher/auto-retry.ts`.
- `readFailingTestFiles` in `src/core/run/failing-tests.ts` returns the failing test files from node:test output, or null when it can't tell.
- A blocked task's dead marker comes from `formatBlockedDeadMarker` in `src/watcher/blocked.ts`.

### Requirements

- After a red change verify, and after any reruns, when every failing test file is owned by an earlier done task of the same change and none is in the current task's own `scope`, the task dies with reason `blocked`, not `change_verify_red`, and is not auto-retried.
- An earlier task owns a test file when the file matches its `scope` or appears on the `Touched:` line of its result file.
- The dead marker names each failing test file, its owner task, and `osq plan <id>`, and keeps the verify excerpt.
- When failing files can't be read, or any failing file has no earlier owner, behavior is as today.

### Non-goals

- Detecting the conflict at plan or lint time (that needs the validator).
- Changing what counts as an unrelated failure for reruns.
