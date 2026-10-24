---
queue_item: rust-sync-active-change
queue_hash: sha256:922aea66ff34c53e84c7223ef74df0a8cdb2814ceddf13b2508f9f7672ab0bfd
planner: null
date: 2026-10-24
---

### Goal

Rust `osq sync` (304) refuses an active change; TypeScript merges the default branch into it and reruns each done task's verify to recertify it. Port that.

### Context

As of 2026-10-24:

- TypeScript: `src/core/vcs/sync-main.ts` with recertification; it finds active changes with `holdsChange` (`.run/approved`).
- Rust sync lives in `crates/features/land/src/land/sync_command.rs` and `sync.rs`; 297 built scope recertification in the retry crate, which land cannot depend on, so shared code moves to a kernel.

### Requirements

- Rust `osq sync <id>` on an active worktree change writes the same merge commit, markers, events and text as TypeScript, recertifying done tasks.
- The active-change lookup matches TypeScript's `holdsChange`.
- The refusal while a watcher runs (`sync-refuses-while-watching`) is kept when that item has landed.
- Tests use scratch repositories and compare with TypeScript's `dist`.

### Non-goals

- Stacked changes.
