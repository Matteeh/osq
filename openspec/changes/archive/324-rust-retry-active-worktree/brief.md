---
queue_item: rust-retry-active-worktree
queue_hash: sha256:4db421348f22c5714879e9edfc2ddd5c6105c901d32c3c841d17bef18f6bccf4
planner: null
date: 2026-10-23
---

### Goal

With git on, a dead task's change lives in its worktree. Rust retry handles checkout changes and archived worktree changes, but refuses a task of an active worktree change, the most common retry.

### Context

As of 2026-10-24:

- TypeScript's `retry` in `src/core/lifecycle/retry.ts` finds the change through `findChange`, which looks in worktrees, and writes the retry there; `retry-plan-edits.ts` checks for plan edits.
- Rust: `crates/features/retry/src/retry/find.rs` finds archived worktree changes only (290); 297 added scope recertification.

### Requirements

- With vcs on, Rust `osq retry <id> <task>` and `osq retry <id> change` on an active worktree change write the same files and events as TypeScript, in the worktree, with its text, including scope recertification there.
- The plan-edits check runs as in TypeScript.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.
- Starting the retried attempt; the watcher or `osq run` does that.
