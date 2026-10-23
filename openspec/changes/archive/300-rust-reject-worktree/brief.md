---
queue_item: rust-reject-worktree
queue_hash: sha256:18879ef9a77d319c155a50c6ec7f4270e01a19c46bf4e544914c72747348d69c
planner: null
date: 2026-10-22
---

### Goal

With git on, a change that fails runs in its own worktree. TypeScript reject commits the move there and removes the worktree. Rust reject (272) works only in the checkout with vcs off.

### Context

As of 2026-10-22:

- TypeScript does it in `src/core/lifecycle/reject-vcs.ts`: commit the rejected move in the worktree, then remove the worktree, keeping it and saying why when the commit fails or leaves changes.
- 272 built reject in `crates/features/approve`. `rust-approve-worktree` creates the worktrees this item rejects in.

### Requirements

- With vcs on, Rust `osq reject <id> "<reason>"` on a worktree change writes the rejection files there, commits them on `osq/<folder>` and removes the worktree, as TypeScript does, with its text.
- Each case where TypeScript keeps the worktree keeps it, with TypeScript's reason.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.
