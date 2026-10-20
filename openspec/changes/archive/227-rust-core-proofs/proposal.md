---
title: A caller can no longer fake an approval or a change state in osq-core
depends_on: ["226"]
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

ADR 022 says gates are types. In osq-core two gates can be faked today.

`Change::approve(self, recorded: Seal, computed: Seal)` compares two
`Seal`s, so a caller can pass the recorded seal twice and get a
`Change<Approved>` without hashing anything. `ChangeState` has public
`record` and `tasks` fields, so a caller can build any state by hand and
hand it to `next_task` or `archive`.

After this change, `compute_seal` returns a `ComputedSeal` that nothing
else can create, and `approve` takes one as its computed side.
`ChangeState`'s fields are private, with `record()` and `tasks()`
readers, so a state comes only from `ChangeState::new` and `apply`.
`compile_fail` doc tests prove that each forgery no longer compiles. Tests
that built states by hand now build them by folding event lines.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings`, and every workspace test and doc test, the corpus tests
included. When osq sets `OSQ_DIFF`, it then runs cargo-mutants on the
change's diff. The `compile_fail` doc tests prove each forgery fails to
compile. The rust-core tests, now folding events, prove that every
existing scenario still holds. The storage seal tests prove that
`change_folder_seal` still gives `hashChangeFolder`'s seals.

## Non-goals

- Changing the fold's rules or the seal algorithm.
- Binding a computed seal to one change. A `ComputedSeal` of one folder
  can still approve another change whose recorded seal is the same text.
- Making `TaskState` or `ChangeRecord` fields private. Without a
  `ChangeState` setter, neither can reach a gate except through `apply`.
- Removing `apply_task` and `apply_change`, the public pure folds.

## Surface

- Added: `osq_core::ComputedSeal` (Rust type), returned by `compute_seal` and by storage's `change_folder_seal`, and taken by `Change::approve` as its computed seal.
- Changed: `ChangeState`'s `record` and `tasks` fields (Rust) become private, read through `record()` and `tasks()`.

## Decisions

- ADR 022: the approve and archive gates are types. The computed seal is a type only `compute_seal` creates, and a change state is a type only the fold builds.
- ADR 023: `ComputedSeal` and the two readers are small named items with doc comments, and core still does no IO.
- ADR 024: every new or changed public function ends its doc with `Implements: rust-core/<requirement>`. Every new test names `Covers: rust-core/<scenario>`, and the `compile_fail` doc tests sit on the items they guard, as the existing ones do.
- ADR 025: nothing read from or written to disk changes.
- ADR 026: the specs kernel is untouched; `ComputedSeal` and the folded state live in core.

## Assumptions

- Outside `crates/core`, only storage uses the changed items: `read/seal.rs` returns `compute_seal`'s seal, and `tests/archive_corpus.rs` and `tests/reading_snapshot.rs` read `state.record` and `state.tasks`. A grep on 2026-10-20 found no other crate naming `ChangeState` fields, `compute_seal` or `approve`.
- Storage's seal tests and core's `seal_compute.rs` only call `.as_str()` on a computed seal, so they compile unchanged against `ComputedSeal::as_str`.
- `ApproveError::SealMismatch` keeps a plain `Seal` for the computed side, so the error stays `Clone` and comparable, and holding one gives no way to approve.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Change typestate", "Seal computation" and "Change fold".
- `specs/rust-storage/spec.md`: MODIFIED "Change folder seal", which now returns the `ComputedSeal`.

No file is shared between tasks.
