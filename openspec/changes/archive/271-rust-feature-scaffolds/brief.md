---
queue_item: rust-feature-scaffolds
queue_hash: sha256:6ff42b89c5e0ba22216b1185f15ef3784d112836555bf31c2a60a41f2e011470
planner: null
date: 2026-10-21
---

### Goal

Every new feature crate edits the root `Cargo.toml` and the CLI's `features()` registry, so changes that each add a crate overlap and run one at a time. One small change should add the four crates the next items need, empty, so those items each touch only their own crate and run side by side.

### Context

As of 2026-10-22:

- The workspace lists each crate in `members` and `[workspace.dependencies]` in the root `Cargo.toml`. `crates/apps/cli/src/lib.rs` registers each `Feature` in `features()`, and `crates/apps/cli/Cargo.toml` depends on each feature crate.
- 239 split capabilities into one per crate. Each Rust capability's spec holds a `Code ownership` requirement and an `osq.yml` with `group: rust`.
- The TypeScript commands these crates will port are `osq show` (`src/cli/show.ts`), `osq lint` (`src/cli/lint.ts`), `osq doctor` (`src/cli/doctor.ts`) and `osq retry` (`src/cli/retry.ts`).

### Requirements

- New crates `osq-feature-show`, `osq-feature-lint`, `osq-feature-doctor` and `osq-feature-retry` under `crates/features/`, each with one capability (`rust-show`, `rust-lint`, `rust-doctor`, `rust-retry`) that owns the crate.
- Each exposes one `Feature` with its name and no commands, registered in the CLI, so the binary's help is unchanged.
- Tests prove each feature's name and empty command list, and that the CLI registry holds it.

### Non-goals

- Any command; each is its own item.
