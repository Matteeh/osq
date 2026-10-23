---
title: The Rust osq show prints one change as TypeScript does
depends_on: ["271"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-storage, rust-specs, rust-loop]
---
## Goal

`osq show <id>` is the command a human runs most after the inbox, and Rust
lacks it: 271 left the show feature empty. This change gives `ShowFeature`
its `show` command. It finds the change as TypeScript's `resolveSpecFolder`
does and prints TypeScript's `formatShowText` byte for byte with vcs off.
That covers the header with status and next step, the tasks and their run
history, the event timeline, the approval digest with its flags, and the
archived extras (verification, validation, recertifications and the land
view). The expected text is TypeScript's own: goldens printed by the built
`dist` from a fixture project in this change folder, which task 1 copies
into the crate.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints
and every Rust test, with the link gates. It also runs cargo-mutants on the
lines this change touched. It proves that every golden in
`crates/features/show/tests/fixtures/golden/` equals the Rust output for its
id, and that the status table and the argument errors hold.

## Non-goals

- `--json`.
- Everything that needs vcs on: the worktree and stacked trees, `Runs after`, the land view's git values, `Sync stopped:`, and `not landed` next steps. Rust show reads no `osq.toml`, so in a vcs-on project it prints the vcs-off text.
- The next steps that read planner, auto-steer and pause records: `planning`, `revised plan ready` and `paused until`.
- The `Scenarios:` task line, which needs TypeScript's import graph of test files.
- A legacy change folder with `spec.md` and no `proposal.md`; every archived change has a proposal.
- Event numbers that JavaScript prints in exponent form, below 1e-6 or from 1e21 up; every recorded value lies between.
- Registering anything new in the CLI: `ShowFeature` is already registered.

## Surface

- Added: `osq-rs show <id>` (command).

## Decisions

- ADR 022: show stays in its own crate on the kernels and core; it copies the small steering and placeholder rules the inbox also holds instead of calling the inbox crate.
- ADR 023: each section of the text is a pure function from read data to lines; only the lookup and the readers touch files.
- ADR 024: every public item ends its doc with `Implements: rust-show/<requirement>`, and each test names `Covers: rust-show/<scenario>`.
- ADR 025: show reads today's change folders, `.run` markers and event JSONL as they are, and writes nothing.
- ADR 026: proposals, task files, deltas and ADRs are read through the specs kernel's parsers.
- ADR 027: no scheduling changes.
- ADR 028: `ShowFeature` gains one `Command` and stays a unit struct with no state.
- ADR 029: show reads no config.

## Assumptions

- The goldens and the status table were printed by TypeScript's `dist` built from main at 272. `golden/print-goldens.mjs.txt` and `golden/print-status-table.mjs.txt` reprint them, and they matched byte for byte when rerun.
- Event `data` keys must print in file order. The crate keeps them in order with its own small ordered deserializer, not serde_json's `preserve_order` feature, which would change key order for every crate in the workspace.
- A rejected change prints `Location: active` and no `Next:` line, as TypeScript does today; the port keeps that.

## Contract

### Requirement: Show text

See `specs/rust-show/spec.md`, with "Show command", "Show arguments", "Show
lookup", "Show lookup errors", "Show status and next step" and "Show
dependency readiness".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-show/spec.md`: REMOVED "Show feature"; ADDED "Show command", "Show arguments", "Show lookup", "Show lookup errors", "Show text", "Show status and next step" and "Show dependency readiness".

Shared files, each written by one task and changed by at most one later
task:

- Task 1 writes every `src/*.rs`. Task 2 changes `src/text.rs`,
  `src/tasks.rs`, `src/header.rs`, `src/model.rs`, `src/runs.rs`,
  `src/digest.rs` and `src/archived.rs`. Task 3 changes
  `src/events.rs`, and task 4 changes `src/planning.rs`.
- Task 2 writes `src/runs/section.rs`, `src/digest/section.rs` and
  `src/archived/section.rs` as empty stubs. Tasks 3, 4 and 6 replace them, in
  that order.
- Task 4 writes `src/digest/section/flags.rs` as a stub, and task 5
  replaces it.

Steering on 2026-10-22 added task 2 and renumbered the run-history, digest,
flags and archived tasks from 2 to 5 as 3 to 6. The old task 2 died blocked
because those sections were constants that only `src/text.rs`, `src/tasks.rs`
and `src/header.rs` could place, and those files were outside its scope.
