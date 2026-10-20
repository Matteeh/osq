---
title: Dead reasons and run outcomes in Rust events are enums, not strings
depends_on: ["227"]
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

In osq-core, every `reason` and `outcome` field that TypeScript fills from a
fixed set of codes is a `String` today. A misspelled reason passes silently,
and readers compare strings: the task fold matches `"passed"` and `"requeued"`
and drops anything else. After this change, each such field is an enum whose
variants are exactly the codes TypeScript writes, so a misspelling fails to
compile, a reader matches on the full set, and a line holding a code outside
the set is a read error.

The values come from TypeScript's types on 2026-10-20 (`RunTaskFailureReason`,
`WorktreeHaltReason`, `SyncStopReason`, `MutationNotMeasuredReason`,
`ValidatorOutcome` and the others the Contract names) and from every event log
osq wrote to the archive. The archive's own logs hold no value outside those
types. Some test fixtures do: storage's fixtures held `" verify_failed "`,
blank reasons, `human`, `survived` and free-text reasons, and archived change
216 keeps a copy of them. Those fixtures get real codes, the corpus test reads
only the logs osq wrote, and storage's "trimmed, else `unknown`" rule for dead
reasons goes, because a typed reason cannot be blank.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy` with
`-D warnings`, and every workspace test and doc test, the corpus tests
included. When osq sets `OSQ_DIFF`, it then runs cargo-mutants on the
change's diff. `event_values.rs` proves each enum's exact value set and its
round trip. `refused_values.rs` proves that a code outside its set is
`InvalidData`. The core corpus test proves that every archived log still
round-trips. The storage fixture and golden tests prove that the read model's
rows are unchanged, apart from the fixture values this change replaces.

## Non-goals

- Changing TypeScript's reasons, outcomes or event writers.
- Free-text fields: `error`, `output`, `note`, `message`, and the `reason` of
  `done_manual` and `rejected`, which a human writes.
- Typing storage's SQL columns. They still hold the code's text.
- Changing the TypeScript-printed goldens under `crates/kernel/storage/tests/golden/`.
  They come from the archive, whose values do not change.

## Surface

- Added: osq-core enums `DeadReason`, `RegressionReason`, `FailureReason`, `RequeueReason`, `MutationReason`, `ValidatorReason`, `SyncStopReason`, `RecertificationOutcome`, `BaselineOutcome`, `FocusedOutcome`, `MutationOutcome`, `ValidatorOutcome`, `AutoSteerOutcome` and `VerificationOutcome` (Rust types), each with `ALL` and `as_str`.
- Changed: the `reason` and `outcome` fields of the `dead`, `regressed`, `retry`, `recertification`, `baseline_ran`, `focused_ran`, `mutation_ran`, `validator_ran`, `auto_steer_ran`, `sync_stopped` and `verification_recorded` payloads (Rust) hold those enums instead of `String`.
- Changed: `TaskState::reason` (Rust) is `Option<FailureReason>`, and storage's `DeadAttempt::reason` is a `DeadReason`.

## Decisions

- ADR 022: events stay the typed record features append. Each value set is part of an event's type, so storage reads typed values and matches on the full set.
- ADR 023: the enums are small named items with a doc comment on every variant. `as_str` is the only function each enum adds, and core still does no IO.
- ADR 024: every new or changed public item ends its doc with `Implements: rust-core/<requirement>`, and every new test names `Covers: rust-core/<scenario>`.
- ADR 025: the on-disk format does not change. Every value serializes as the string it has today. A value TypeScript adds later is a read error until rust-core adds it, as an unknown event type already is.
- ADR 026: the specs kernel is untouched.

## Assumptions

- No crate outside `crates/core` and `crates/kernel/storage` reads these fields. A grep on 2026-10-20 found none in `crates/features` or `crates/apps`.
- A `retry` reason is the reason in the dead or regressed marker frontmatter, else `dead` or `regressed` (`markerReason` in `src/core/lifecycle/retry.ts`). Markers are written only by the watcher with `DeadReason` or `RegressionReason` codes, so `FailureReason` covers every retry.
- `recertification` carries a `reason` only when requeued, and it is always `scope_regression` (`SCOPE_REGRESSION` in `retry.ts`).
- `verification_recorded` is no longer written. Its `VerificationOutcome` keeps the two values `osq verified` once wrote, `passed` and `failed`.
- `auto_steer_ran`'s outcome keeps `running` because TypeScript's `AutoSteerOutcome` allows it, though the event is appended only after a run ends.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-core/spec.md`: MODIFIED "Event types" (the value sets, new scenario "Reason and outcome values", and real codes in "Every event type parses"), "Event lines round-trip" (the corpus reads only each archived change's own logs), "Event read errors" (out-of-set values, new scenario "Values outside their set are refused"), "Task fold" and "Change fold" (typed reason, real codes in the tables).
- `specs/rust-storage/spec.md`: MODIFIED "Change snapshot" and "Read model tables": a dead attempt's reason is the event's code, with no trimming or `unknown`.

Shared file: `crates/core/tests/event_values.rs` belongs to task 1 and falls
inside task 2's `crates/core/tests/*.rs` glob. Task 2 leaves it unchanged.
