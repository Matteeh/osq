---
queue_item: rust-loop-schedule
queue_hash: sha256:7494bb4cf8ccec3c2d223491d6c7691346cffe42fd12c3f8d94246d39cfe5b5c
planner: null
date: 2026-10-20
---

### Goal

The scheduler runs on real repository data: the loop reads what is approved, running and done from files and asks core what may start.

### Context

As of 2026-10-19:

- `crates/kernel/loop` (`osq-kernel-loop`) is an empty skeleton on `osq-core`. No capability owns it yet. Kernel crates may depend on other kernel crates (ADR 022).
- The storage kernel reads change folders, markers and events into the read model (rust-storage), including approval and each task's state. The specs kernel parses a proposal's `depends_on` (`crates/kernel/specs/src/document/proposal.rs`) and matches scope globs with `scope_covers_path` (`crates/kernel/specs/src/owners/glob.rs`).
- Core's scheduler (`rust-scheduler-core`) takes resolved file paths, dependencies with their done state, approvals and the running set.

### Requirements

- A `rust-loop` capability in group `rust` owns `crates/kernel/loop/**`.
- The loop reads the active changes of a repository, resolves each approved change's task scopes against the repository's files, works out dependencies and the running set from storage, and returns core's state for every change.
- Tests on fixture repositories cover each state, a dependency on an archived change, and a scope glob that resolves to files of a kernel crate.
- A corpus test reads this repository and gives a state for every active change without error.

### Non-goals

- Spawning agents, the `Feature` trait and hook registration, the broadcast wake-up channel, and landing; they come with the runners and feature crates.
- Any CLI or server surface for the states.
- Changing the TypeScript watcher.
