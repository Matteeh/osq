---
queue_item: rust-land-sync
queue_hash: sha256:ab24ab83580d82e75829de9d4f45fd437268452a280f1c22c11d96d66ed5bf36
planner: null
date: 2026-10-22
---

### Goal

When the default branch moved after a change was approved, TypeScript land first merges it into the change's branch, rebuilds conflicting living specs and `Cargo.lock`, and stops on a code conflict. Rust land has no sync, so it can't land a change once main has moved on, which happens to almost every change when several run in parallel.

### Context

As of 2026-10-22:

- TypeScript syncs in `syncWithDefaultBranch` in `src/core/vcs/sync-main.ts`, called from `landChange` in `src/core/vcs/land.ts`. A stop is a `SyncStop`, recorded by `recordLandStop` in `src/core/vcs/land-stop.ts`. 262 rebuilds a conflicting `Cargo.lock`.
- 256, 265 and 279 built `crates/features/land`. The vcs kernel commits, merges and runs git with timeouts from config. The specs kernel merges deltas (218).

### Requirements

- Before the land commit, Rust `osq land <id>` merges the newer default branch into `osq/<folder>` as TypeScript does, with its commit message.
- A conflict only in living specs is rebuilt from the change's deltas, and one only in `Cargo.lock` is rebuilt, as TypeScript does. Any other conflict stops the land, writes TypeScript's land-stop record and text, and leaves the branch as it was.
- Tests use scratch repositories for a clean merge, a spec conflict, a lockfile conflict and a code conflict.

### Non-goals

- The bridge commit for stacked changes; Rust land still refuses them.
- `osq sync` as its own command.
