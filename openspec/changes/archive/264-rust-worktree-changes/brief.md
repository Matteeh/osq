---
queue_item: rust-worktree-changes
queue_hash: sha256:0d74920f15b771415f74964736aaaf5e9268c7866d0ec31f798f203de4ca965d
planner: null
date: 2026-10-21
---

### Goal

Rust reads change folders only from the checkout. On a project with `vcs.enabled`, approved changes run in osq worktrees, so the Rust inbox misses them and plan numbering can reuse a number a worktree already holds.

### Context

As of 2026-10-21:

- `list_changes(project_root)` in `crates/kernel/storage/src/read/listing.rs` walks only `openspec/changes` under the checkout. Plan numbering in `crates/features/plan/src/next/number.rs` reads folders the same way.
- The vcs kernel gives `worktree_list()` (241). TypeScript joins the trees in `changeTrees` and `listChanges` in `src/core/status/change-locations.ts`, under the version-control requirements on change locations.
- The config kernel gives `VcsConfig`, including whether vcs is enabled (252).

### Requirements

- The storage listing takes the trees to read from its caller and lists each change once, from the tree TypeScript's `changeTrees` would pick, with that tree on the entry.
- Plan numbering counts change folders in every tree, as TypeScript does.
- Tests use scratch git repositories with real worktrees.

### Non-goals

- Changing what the inbox or approve does with worktree changes; those are their own items.
