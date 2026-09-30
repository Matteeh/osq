---
queue_item: scope-deletions
queue_hash: sha256:0269c45291895bc6d38ee57cc9d7edf1d3ff9254271c1e51ab04b84fa5507630
planner: null
date: 2026-09-30
---

### Goal

A task can delete a file its `scope` names. The watcher's guard accepts the deletion, and the task's commit records it. A deleted or changed file outside the scope is still a `scope_violation`.

### Context

As of 2026-09-30:

- `scopeViolations` in `src/watcher/git-guard.ts` resolves the task's scope with `resolveScope` after the task, then keeps only entries whose `absolutePath` is not null. A file the task deleted resolves to a null `absolutePath`, or, under a glob, is not listed at all, so the guard reports it as a `scope_violation`.
- This killed 123 task 2 attempt 1 and 123 task 4 attempt 2. Both tasks then left the modules as inert `export {};` files: `src/cli/done.ts`, `src/core/lifecycle/done.ts`, `src/core/status/leftover-drafts.ts`, `tests/done-manual.test.ts`, and `tests/status-leftover.test.ts`. Change 125 was planned to leave five more the same way.
- `verifiedCommitPaths` in `src/core/run/task-commit.ts` passes every path through `existingPaths`, which drops a deleted file. So even past the guard, the task's commit would not record the deletion, and the worktree would stay dirty.
- `captureTestGate` in `src/watcher/verify.ts` builds its authorized set before the task runs, while the files exist, so deleting a scoped test with `tests.modify: true` already passes the test gate.
- `scopeCoversPath` in `src/core/run/scope.ts` matches a path against scope patterns without reading the disk. `scopedStatusPaths` in `task-commit.ts` already uses it.

### Requirements

- A task that deletes a file its scope names, exactly or through a glob, is not a `scope_violation`.
- A task that deletes a file outside its scope is still a `scope_violation`.
- The task's verified commit records the deletion, and the worktree is clean after it.
- A task with `tests.modify: true` can delete a scoped test file and pass.

### Non-goals

- Deleting the inert modules 123 left. That is `inert-module-cleanup`, which needs this change landed and the watcher rebuilt first.
- Changing how the recertification audit hashes a deleted file.

### Notes for planning

- The fix must be landed and built before any change's task can rely on it: the watcher runs main's build. This change's own tests cannot delete files through the watcher it is fixing, so they drive `runGitGuard` and `commitVerifiedTask` directly.
