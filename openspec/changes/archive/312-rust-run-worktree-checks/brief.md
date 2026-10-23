---
queue_item: rust-run-worktree-checks
queue_hash: sha256:192e36f4bd125d24a11d85e9d6307a4b3180a0bba8310e99003a1122d2992355
planner: null
date: 2026-10-23
---

### Goal

`rust-run-worktree` (301) runs tasks in the change's worktree but left out TypeScript's safety checks: it doesn't refuse a worktree that is off its branch or dirty, and a failed task commit just fails the run. TypeScript halts the change with a reason a human can retry.

### Context

As of 2026-10-23:

- TypeScript names the halts `worktree_off_branch`, `worktree_dirty` and `commit_failed` in `src/watcher/worktree-run.ts`. `src/watcher/commit-catch-up.ts` makes the missing commits on a later pass within `gates.commitRetries`.
- 301 built the worktree run in `crates/features/run`, with `patch` and `discard` in the vcs kernel.
- `gates.commitRetries` (default 2) is in `src/core/foundation/config-gates.ts`. The Rust config has no `gates` block yet, so this item adds one with only that key.

### Requirements

- Before spawning the executor, Rust `osq run <id> <n>` halts the change with TypeScript's marker, event and text when its worktree is off `osq/<folder>` or has uncommitted changes.
- When a task commit fails, the run writes TypeScript's `commit_failed` halt with git's error, and a later `osq run` of that change first makes the missing commit and clears the halt, within `gates.commitRetries` tries, as the catch-up does.
- Tests use scratch repositories, with the commit made to fail by a failing pre-commit hook.

### Non-goals

- Regressed and recertification commits, and stacked changes.
