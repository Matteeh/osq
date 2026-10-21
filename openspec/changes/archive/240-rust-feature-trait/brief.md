---
queue_item: rust-feature-trait
queue_hash: sha256:062476d740ac24075475e5d25f700bf58dffe5672fbf5356f8c631d9ac314bc4
planner: null
date: 2026-10-20
---

### Goal

ADR 022 says a feature crate exposes one implementation of core's `Feature` trait and keeps everything else private, but the trait does not exist. Every feature item needs it, so it comes first, written once in core, with the smallest shape the first features need.

### Context

As of 2026-10-21:

- `crates/core/src/lib.rs` has `change`, `event`, `fold`, `graph`, `schedule` and `seal`. No `Feature` trait exists. 237 (rust-loop-schedule) writes `crates/core/src/schedule.rs`.
- ADR 022 section 2: a feature crate holds its logic, its CLI subcommand, its server routes and the loop hooks it reacts to, and exposes one `Feature` implementation. Core does no IO and depends on nothing in the workspace.
- Architecture page (Notion, OSQ > Rust Rebuild > Architecture): features share data only through events and the read model; apps only register features. The CLI, server and loop are not built yet.
- The first features planned on it are `report` (`osq query`) and `inbox`.

### Requirements

- An ADR records the trait's shape and what it leaves for later (routes and loop hooks may be left out until the server and loop need them). It names its enforcement, as every Rust ADR must.
- Core holds the `Feature` trait: at least the feature's name and the commands it offers as plain data, and a way to run one command with its arguments against inputs core can describe without IO, returning output or a typed error.
- A test in core shows a hand-written feature implementing it.
- Every public item has `Implements:` tags, and each test names its scenario, as ADR 024 requires.

### Non-goals

- Implementing the trait in any feature crate, or wiring the CLI.
- The lint gate that a feature crate exposes nothing else; it can come with the second feature.
