---
title: The Rust core reads today's event logs into typed events, folds them into change state, and gates approve and archive by type
depends_on: []
verify: sh scripts/verify-rust.sh
creates:
  - name: rust-core
    group: rust
features:
  reads: []
---
## Goal

The Rust rewrite of osq starts with its core crate, `crates/core`, which is
empty today. Everything later reads change state through it: storage, the
loop, run, approve, archive and report. So the core types come first, with no
IO, and they must read the 79,000 event lines osq has already written exactly
as they are, because the rewrite keeps the archive instead of importing it.

After this change `osq-core` holds:

- the `Event` enum, one typed variant for each of the 35 event types today's
  TypeScript osq writes, with an envelope that reads and writes a JSONL line
  so that the JSON value of every archived line comes back unchanged, and read
  errors that never skip a line;
- `apply_task`, `apply_change` and `apply`, pure folds from a change's event
  streams to task and change state, and `change_status`, the status order
  TypeScript's `deriveSpecState` uses;
- `Seal` and `Change<Draft>`, `Change<Approved>`, `Change<Archived>`, so a
  change is approved only by a seal check and archived only when done, and
  the compiler refuses anything else.

## Verify

`sh scripts/verify-rust.sh`

The script runs `cargo fmt --all --check`, `cargo clippy --workspace
--all-targets -- -D warnings` and `cargo test --workspace` over the final
tree. That covers every `osq-core` integration test, including the
round-trip of every archived event line, the property test on the folds and
the `compile_fail` doctests of the gates. No test needs the network once the
crates are fetched, and none needs `node`.

## Non-goals

- Any IO: reading event files, markers or change folders is the storage
  kernel's job. Core gets lines and seals as values.
- Computing the approval seal over a change folder (the seal golden test of
  the on-disk format ADR). Core only compares two seals.
- The `blocked` status, which needs other changes' state, and the stacked,
  paused-change and steering states of `osq status`.
- The queue planning records (`plan_started`, `plan_exited`, `plan_ready`),
  which live outside `.run/events/`.
- `check_ran`, which TypeScript osq still reads but no longer writes and
  which no event file holds.
- The `Feature` trait, the link graph and any other core type the later
  crates need.
- The `#[covers]` attribute and the tag reader.
- The archive replay test against markers and the `insta` schema snapshot;
  both need the storage kernel.

## Surface

- Added: the `rust-core` capability and the `osq-core` crate's public items `Event`, `Envelope`, `EventError`, `parse_event_line`, `event_line`, `Stream`, `TaskId`, `TaskStatus`, `TaskState`, `ChangeRecord`, `ChangeState`, `ChangeStatus`, `apply_task`, `apply_change`, `apply`, `change_status`, `Seal`, `SealError`, `Change`, `Draft`, `Approved`, `Archived`, `ApproveError` and `ArchiveError`.

## Decisions

- Departs from ADR 016: rust-core lives in `crates/core`, the Rust workspace's core crate, not in a folder under `src/`. The Rust rebuild's feature-crates ADR on the Notion Rust Rebuild page replaces ADR 016's layout for the Rust crates, but it is not in `decisions/` yet.

## Assumptions

- The five Rust rebuild ADRs on Notion are not in `decisions/`: scoped to `rust-core`, each one warns until rust-core has a living spec, and 13 ADR tests require no decision warnings. The plan follows them anyway: one event enum in core, a pure fold, typestate gates, no IO in core, workspace lints, and today's event format as is.
- Tests name the scenario they prove with a `/// Covers: rust-core/<scenario>` doc line, and public functions name their requirement with `/// Implements: rust-core/<requirement>`, both as kebab-case of the name. The `#[covers]` attribute of the link-enforcement ADR needs a proc-macro crate that does not exist yet.
- The event-type table comes from `src/harness/types.ts`, the change-level writers (`archived`, `synced`, `sync_stopped`, `verification_recorded`), and every line under `openspec/changes/**/.run/events/` on 2026-10-17: 79,367 lines of 25 types, all with the `type`, `timestamp`, `data` envelope. A field is required when `types.ts` requires it and every archived line has it. Ten types are written by today's code but appear in no file yet, so only the scenario rows prove them.
- A new event type or field that TypeScript osq starts writing will fail the archive round-trip test once an archived line holds it. That is the drift check the on-disk format ADR asks for, and the fix is a new variant or optional field.
- The task fold follows the TypeScript writers and markers but is not yet checked against the archive's `done/` and `dead/` markers; the replay test that does so comes with the storage kernel.
- The watcher's verify passes only `PATH`, `HOME` and the other base names of ADR 007. Cargo works with them when rustup is installed in its default place under `HOME` and `~/.cargo/bin` is on the watcher's `PATH`.
- The executor fetches `serde`, `serde_json` and `proptest` once, while it works on task 1 or 2, so `Cargo.lock` and the local registry hold them before the watcher's own verify runs.

## Human steps

### Before approval

- Install a Rust toolchain of 1.85 or newer with `rustfmt` and `clippy` on the machine that runs the watcher, for example with rustup, and make sure `cargo` is on the watcher's `PATH`.
- Land 203 first.

### After landing

None

## Delta

- `specs/rust-core/spec.md`: ADDED "Code ownership", "Core does no IO", "Event types", "Event lines round-trip", "Event read errors", "Event streams", "Task fold", "Change fold", "Fold determinism", "Change status", "Approval seal", "Change typestate".

Shared files: `crates/core/src/lib.rs`, `crates/core/Cargo.toml` and `Cargo.lock`. Task 1 creates the crate's dependencies and its first modules, task 2 adds the `proptest` dev-dependency and the fold module, and task 3 adds the change module. Each later task only adds lines to them.
