---
title: The rust-storage Archive replay requirement names the exceptions the replay test uses, 003 to 013
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads:
    - rust-core
---
## Goal

The living rust-storage requirement "Archive replay" and its scenario
"Archived changes replay" say the replay test's exceptions are 004 to 013.
Change 210's task 4 found that `003-watcher-and-harness` also folds to all
pending: it has no `.run/events/` folder and holds done markers 1 to 5. So
`EXCEPTIONS` in `crates/kernel/storage/tests/archive_corpus.rs` lists 3 to 13,
and the test passes. This change makes the spec say what the test checks,
with the reason for each exception.

## Verify

`sh scripts/verify-rust.sh`

The script runs the format check, clippy, every workspace test with the
corpus tests included, so `archived_changes_replay` runs over the live
archive with its 3 to 13 exceptions, and cargo-mutants on the change's diff.
No Rust source line changes, so no mutant is made.

## Non-goals

- Any change to storage's reading or to what the replay test checks.

## Surface

None

## Decisions

- ADR 022: no crate's layering or dependencies change.
- ADR 023: the test stays in the crate's `tests/` folder.
- ADR 025: no Rust source line changes, so the mutation gate has nothing to mutate.
- ADR 026: storage keeps its read model; the specs kernel is untouched.
- ADR 024: the test keeps its `Covers: rust-storage/archived-changes-replay` tag; only the requirement text and the constant's doc comment change.

## Assumptions

None

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-storage/spec.md`: MODIFIED "Archive replay".
