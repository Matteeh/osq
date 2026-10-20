---
queue_item: rust-core-proofs
queue_hash: sha256:1212692f950b4f8acaaa33022f36fa4020775d4a094dc7b7cfcbb0c5de1b9750
planner: null
date: 2026-10-20
---

### Goal

ADR 022's "gates are types" holds: `Change<Approved>` can only come from a seal osq computed, and a `ChangeState` can only come from folding events.

### Context

As of 2026-10-19:

- `Change::approve(self, recorded: Seal, computed: Seal)` in `crates/core/src/change.rs` compares two `Seal`s. A caller can pass the recorded seal twice and get `Change<Approved>` without hashing anything. `compute_seal` (from `rust-approval-seal`) is the only honest source of the computed seal.
- `ChangeState` (`crates/core/src/fold/change.rs`) has public fields `record` and `tasks`, so a caller can build any state by hand and pass it to `next_task` or `archive`. Core's tests build states by hand in helpers (`tests/gates.rs`, `tests/fold.rs`).
- rust-core "Change typestate" and "Approval seal" describe the gates.

### Requirements

- `approve` accepts the computed side only as a type that `compute_seal` alone creates, so equal-seal approval without hashing does not compile.
- `ChangeState`'s fields become private with read accessors; a state comes only from `ChangeState::new` and the fold. Tests that built states by hand build them by folding events instead.
- A compile-fail test, or a doc test marked `compile_fail`, proves each forgery no longer compiles.
- Every existing rust-core scenario stays proven.

### Non-goals

- Changing the fold's rules or the seal algorithm.
