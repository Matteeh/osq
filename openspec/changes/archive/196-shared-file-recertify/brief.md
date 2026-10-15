---
queue_item: shared-file-recertify
queue_hash: sha256:c76ab02a114c2426f891471ecc8f60ffb6faeb65a07c21ec9c453e27819eba29
planner: null
date: 2026-10-15
---

### Goal

When a later task changes a file that an earlier done task owns, and the later task has that file in its scope, the watcher recertifies the earlier task by itself when its verify still passes, whichever harness ran the tasks. PLANNER.md already promises this; today it holds only for harnesses that report file changes. When a scope regression does stop a change and the owner's verify passed, the next step offers `osq retry <id> <task>`, not a new plan.

### Context

As of 2026-10-14:

- `auditScopeRegressions` in `src/watcher/regression.ts` recertifies a stale done task automatically only when `attributeScopePaths` in `src/core/run/scope-hash.ts` credits every differing path to one later task. It credits a path only from typed `file_changed` events in that task's stream. With no candidate, the path is `unknown` and the task is marked `regressed` with `scope_regression`.
- The claude, codex and pi adapters emit `file_changed`. The opencode and agy adapters emit none. In 192, task 4 used opencode's `edit` 30 times and `write` 16 times and recorded 0 `file_changed` events, so task 3 regressed although the plan named `ChangeView.tsx` as shared and task 3's verify passed (17 of 17). The change halted.
- The next step for that halt was `dead (needs steering) — osq plan 192`. `osq retry 192 3` was enough: for a scope regression, `retry` reruns the owner's verify and recertifies it in place when it passes (`src/core/lifecycle/retry.ts`).
- Notion: "Gap: shared files never recertify under opencode (192, 2026-10-14)" and its Bugs and incidents row.

### Requirements

- When no typed event credits a differing path, the watcher credits it from what the tree shows: the one later done task whose run changed that path, with the path in that task's scope. Planning finds what osq already records per run to tell that (pre-spawn snapshots, the git guard, measures, the commit per task in worktree mode) and uses it rather than adding a new record.
- A path two later tasks changed, or a path no later task has in scope, stays `ambiguous` or `unknown` and regresses as today.
- A typed `file_changed` event keeps winning when one exists.
- For an active `scope_regression` whose recorded verify passed, the next step is `osq retry <id> <task>`, and the inbox and dispatch offer it as the action.
- The regression event records which way the path was credited, so `osq query` can count diff-based recertifications.

### Non-goals

- Adding `file_changed` events to the opencode or agy adapters. Fine as a later item, but not needed once the diff fallback exists, and opencode's `shell` writes would still be invisible to it.
- Changing what a scope violation is, or the git guard.

### Notes for planning

- New event keys break the golden-event fixtures; scope `tests/fixtures/events`.
- Reproduce the 192 case in a test with the mock harness emitting no `file_changed`: two tasks sharing one file, the later one in scope, the earlier one's verify green.
