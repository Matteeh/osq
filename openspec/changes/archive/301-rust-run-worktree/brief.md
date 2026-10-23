---
queue_item: rust-run-worktree
queue_hash: sha256:a03080b02f73a7bd0bd3e631ef201415e50807be46457d9d33515f41aa1ef767
planner: null
date: 2026-10-22
---

### Goal

With git on, TypeScript runs each task in the change's osq worktree and commits a verified task there, so parallel changes never share a tree. The Rust run (273) runs only in the checkout.

### Context

As of 2026-10-22:

- TypeScript commits in `commitWorktreeVerifiedTask` and `commitWorktreeDeadTask` in `src/watcher/worktree-commit.ts`, with the worktree found by the runner in `src/watcher/runner.ts`.
- 273, 281 and `rust-run-usage-pause` built `crates/features/run`. The vcs kernel lists worktrees and commits.

### Requirements

- With vcs on, Rust `osq run <id> <n>` runs the executor, verify and scope audit in the change's worktree, and commits a done or dead task on `osq/<folder>` with TypeScript's message.
- With vcs off, run behaves as today.
- Tests use scratch repositories and the committed fake pi.

### Non-goals

- Stacked changes and the baseline verify.
