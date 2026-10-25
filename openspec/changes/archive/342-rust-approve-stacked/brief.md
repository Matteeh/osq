---
queue_item: rust-approve-stacked
queue_hash: sha256:2f5605f7c0fb064442971fab27ff56098c7a8a809f1f3a1c84dbdecc1f7fc10a
planner: null
date: 2026-10-25
---

### Goal

Rust approve refuses a change that would stack ("Stacked approval refusal"). With parallel lanes, overlapping changes are common, so Rust approve should stack them as TypeScript does.

### Context

As of 2026-10-24:

- TypeScript: `awaitedForApproval` in `src/core/spec/stack-overlap.ts` picks the changes to stack on; approve writes `.run/stacked-on` and creates the worktree on the chain tip (170).
- Rust approve has the refusal with the same selection.

### Requirements

- Rust `osq approve <id>` on a change TypeScript would stack writes the same `.run/stacked-on`, branch, worktree, events and text as TypeScript.
- Tests use scratch repositories with one and two stacked changes and compare with TypeScript's `dist`.

### Non-goals

- Running, rejecting or landing stacked changes in Rust.
