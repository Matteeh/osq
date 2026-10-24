---
queue_item: rust-land-remove-worktree
queue_hash: sha256:703df4e29279380305b769d87cddbdd34de39ba85113db2b19db8b0961de614e
planner: null
date: 2026-10-23
---

### Goal

Rust land prints `<folder> has already landed; Rust land does not remove worktrees yet`. Port the worktree removal with the rules `land-removes-worktree-folder` gives TypeScript.

### Context

As of 2026-10-24:

- `crates/features/land/src/land/text.rs` has the placeholder line; the vcs kernel has `worktree_remove`.
- `land-removes-worktree-folder` defines moving `.run/logs`, removing ignored files, no timeout on the delete, pruning and the failure text.

### Requirements

- Rust `osq land <id>` removes the worktree as TypeScript does after that item, with its text and exit codes, including the cleanup on a second land.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.
