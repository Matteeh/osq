---
queue_item: rust-scheduler-core
queue_hash: sha256:60ab9798de0c7e2bbf1bdb3b028b358a5d42d9a50047466fe5e40e9968164afd
planner: null
date: 2026-10-20
---

### Goal

ADR 027's scheduling rule exists as a deterministic function every later caller shares: the loop, the server and the UI board get the same answer from the same input.

### Context

As of 2026-10-19:

- ADR 027 (from `rust-scheduling-adr`) gives the states Ready, Waiting on <id>, Blocked by <id> with the shared files or crate, and Needs approval, and the overlap rules: approved task scopes overlap when they share a file, and any file under `crates/core/` or `crates/kernel/<name>/` locks that whole crate.
- Core already holds the change fold, `ChangeStatus` and the `Change<Approved>` typestate (`crates/core/src/change.rs`, `crates/core/src/fold.rs`). Core does no IO (ADR 022), so it takes scopes as resolved file paths, not globs.
- rust-core's tests include `proptest` property tests (`crates/core/tests/fold_props.rs`).

### Requirements

- Core takes the changes in queue order, each with its approval, its explicit dependencies and whether each is done, and the resolved file paths of its approved task scopes, plus the changes now running. It returns one state per change with its reason, and the changes to start now.
- A change starts only when it is approved, every dependency is done, and it overlaps no running change and no change started before it in the same call. Ties go to queue order.
- A table-driven test covers each state and each overlap rule, including two changes that lock the same kernel crate through different files.
- Property tests prove the rule is deterministic, that no two started or running changes overlap, and that a change with an unmet dependency never starts.

### Non-goals

- Reading change folders, resolving globs or spawning anything; that is `rust-loop-schedule` and later features.
- Agent limits per role, hard caps per run and usage-limit pauses.
- Parallel tasks inside one change.
