---
queue_item: rust-land-config-timeouts
queue_hash: sha256:05376f95d8e4fa9024242fb4d78c5df040d2ead734be6c94abb00156edb26207
planner: null
date: 2026-10-21
---

### Goal

Rust land builds every `GitVcs` with `GitVcs::new`, which uses TypeScript's default limits, so a project's `timeouts` in `osq.toml` do not reach the git commands land runs.

### Context

As of 2026-10-21:

- `GitVcs::with_timeouts(&Timeouts)` and `VcsError::TimedOut` landed in 257.
- `crates/features/land/src/land.rs` already reads the config kernel for the author and calls `GitVcs::new` in three places.

### Requirements

- Every `GitVcs` land builds carries the loaded config's `timeouts`.
- A git command that times out during land fails with the land error TypeScript gives for a failed git command, naming the command and the limit.
- Tests use the committed fake git from 260 with short timeouts in a fixture `osq.toml`.

### Non-goals

- Timeouts for any other feature.
