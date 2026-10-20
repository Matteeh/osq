---
queue_item: rust-capability-split
queue_hash: sha256:f8f509b892f0077e3d113d5e4a4792e38ff2f891f20b76d51b47d76559241f44
planner: null
date: 2026-10-20
---

### Goal

Rust changes can run in parallel. Today every crate a change fills in has to leave `rust-workspace` first, so every such change modifies `rust-workspace`'s `Code ownership`. Two of them in flight at once then stop with `requirement_changed` at sync, and land refuses the second one. After this change each crate already has its own capability, and a change touches only its own.

### Context

As of 2026-10-21:

- `rust-workspace` owns 14 placeholder crates by `Code ownership` globs: kernel `vcs`, `runners`, `harnesses`, `agents` and `loop`, the feature crates `plan`, `approve`, `run`, `archive`, `land`, `inbox`, `report` and `metaloop`, and the `cli` app. 237 (rust-loop-schedule) moves `loop` out into `rust-loop`.
- Each placeholder holds a 3-line `src/lib.rs` and depends only on `osq-core`.
- ADR 022: one feature crate is one capability, and its folder is what the capability owns. ADR 024's `complete-capabilities` rule needs each `rust` capability to have a Purpose, a requirement and an owned file.
- 238 (gates-see-the-change) makes the link gates read a change's ADDED and MODIFIED `Code ownership`, and makes the corpus gate block on `owned-once`. It ignores a REMOVED `Code ownership`.
- `osq capability split` generates the deltas that move requirements out of a capability.

### Requirements

- One new capability in group `rust` per remaining placeholder crate except the `cli` app: `rust-vcs`, `rust-runners`, `rust-harnesses`, `rust-agents`, `rust-plan`, `rust-approve`, `rust-run`, `rust-archive`, `rust-land`, `rust-inbox`, `rust-report` and `rust-metaloop`. Each has a Purpose taken from the Rust Rebuild architecture, a `Code ownership` requirement for its crate folder, and its sidecar.
- `rust-workspace`'s `Code ownership` is modified to own only `crates/apps/cli/**`, so no file has two owners during the change's own run.
- `sh scripts/verify-rust.sh` passes with the change in `OSQ_CHANGE`, `owned-once` included.
- No Rust source file changes.

### Non-goals

- Filling in any crate, or adding dependencies between them.
- Removing `rust-workspace`; it keeps the `cli` app until the apps are built.
