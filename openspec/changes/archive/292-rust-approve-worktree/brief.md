---
queue_item: rust-approve-worktree
queue_hash: sha256:16aeb3df14f72ccc224170f6502aefeb3d90c27c93cbdf48dc6ecc6aaccd01d9
planner: null
date: 2026-10-22
---

### Goal

With git on, TypeScript approves a change by sealing it, committing it on its own branch and moving it into an osq worktree, so the watcher runs it beside other changes. Rust approve (250) works only in the checkout with vcs off, so Rust can't start a parallel run.

### Context

As of 2026-10-22:

- TypeScript does it in `approveIntoWorktree` and `runPrepare` in `src/core/spec/approve-worktree.ts`, with shared steps in `approve-worktree-shared.ts`. ADR 003: osq alone writes git, and never rewrites history.
- 250 and 272 built `crates/features/approve`. The vcs kernel has `create_branch`, `commit`, `worktree_add` and `worktree_list`; 265 gives git timeouts from config.

### Requirements

- With vcs on, Rust `osq approve <id>` on an unstacked change seals it, commits it, creates its branch and worktree, and removes the checkout copy as TypeScript does, with its text.
- Every refusal happens before the first write.
- Tests use scratch repositories and compare the branch, worktree and `.run` files with TypeScript's `dist`.

### Non-goals

- Stacked changes, steered re-approval and the default-branch paths.
