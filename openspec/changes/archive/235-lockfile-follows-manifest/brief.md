---
queue_item: lockfile-follows-manifest
queue_hash: sha256:31db7f2828361819a7168b0ce5b44f880371bb19baf9f1b62a5b7c879d25d940
planner: null
date: 2026-10-20
---

### Goal

Executors stop dying on a lockfile they had to change: adding a dependency to a manifest changes the lockfile too, and osq counts that as inside the task's scope instead of relying on the planner to remember it.

### Context

As of 2026-10-20:

- 229 task 1 died with `scope_violation` because adding `<dep>.workspace = true` to a crate's `Cargo.toml` changed the root `Cargo.lock`, which its scope lacked. The executor then hand-wrote SHA-256 to dodge it and died on mutants.
- A path's language comes from its nearest manifest, and language-specific code sits behind the languages kernel adapter (ADR 017).
- With parallel changes, more tasks add dependencies at once, so the miss will repeat.

### Requirements

- When a task's resolved scope holds a manifest (`Cargo.toml`, `package.json`), the scope check also allows that workspace's lockfile (`Cargo.lock`, `pnpm-lock.yaml`), found through the languages adapter.
- The scope audit of done tasks treats the lockfile the same way.
- No new lint rule and no new planner rule.

### Non-goals

- Lockfiles of package managers osq does not detect today.
- Merging lockfile conflicts at land.
