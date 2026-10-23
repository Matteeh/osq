---
queue_item: rust-sync-message-commands
queue_hash: sha256:3cae2a9538c32bf72bbe7d1cc1133cea2bb7582cf40787e173d2c1a2c0f5a7de
planner: null
date: 2026-10-22
---

### Goal

`osq sync <id>` merges a newer default branch into a change's branch without landing it, and `osq message <id>` prints the land commit message an archived change will get. Rust has neither. 294 already merges the default branch inside land, and 256 already builds the land message, so both commands mostly expose code the land crate has.

### Context

As of 2026-10-23:

- TypeScript: `syncCommand` in `src/cli/sync.ts` calls `syncChange` in `src/core/vcs/sync-change.ts`, which refuses with `OSQ_SYNC_NEEDS_GIT` when vcs is off. `src/cli/message.ts` prints `buildSquashMessage` from `src/core/run/squash-message.ts` and exits one when the change is not archived.
- Rust: `crates/features/land/src/land/sync.rs` (294) runs the merge, with spec and `Cargo.lock` rebuilds and the land-stop record. `crates/features/land/src/land/message.rs` (256) builds the squash message. A feature never depends on another feature, so both commands go on `LandFeature`, as 298 put `spec` on `ShowFeature`.

### Requirements

- Rust `osq sync <id>` merges the default branch into `osq/<folder>` as land's sync does, and prints TypeScript's text for a clean merge, a rebuilt conflict, a stop and vcs off.
- Rust `osq message <id>` prints the message TypeScript prints for an archived change, and TypeScript's refusal and exit code otherwise.
- Goldens are printed by TypeScript's `dist` from scratch repositories and committed in the change folder.

### Non-goals

- The bridge commit for stacked changes.
