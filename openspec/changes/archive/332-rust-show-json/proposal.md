---
title: Rust osq show --json prints TypeScript's change details JSON
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-vcs, rust-specs, rust-storage]
---
## Goal

`osq show <id> --json` is how tools and agents read one change. Rust `show`
prints only the text view and refuses `--json`. This change ports
TypeScript's `formatShowJson`, so Rust `osq show <id> --json` prints the
same bytes as TypeScript for checkout, worktree and archived changes, with
git on and off.

The JSON is built from what the text view already derives in the show
crate: the change model, status and next step, events, planning sessions,
recertifications, the approval digest and the land facts. Where a reader
keeps only what the text prints, such as land capability counts, it keeps
the full values and the text counts from them.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints and every Rust test, corpus tests included. The watcher also runs
cargo-mutants on the touched lines. It proves that `show` takes `--json` in
any position and refuses the same bad ids, and that its JSON equals each of
16 TypeScript goldens: the ten fixture changes with git off, five land
setups of the archived change with git on and off, and an approved change
in an osq worktree.

## Non-goals

- `osq status --json`; TypeScript has none.
- A task's `scenarios` and the `runsAfter` member, which the Rust text view does not print either.
- The planner, auto-steer and pause records in the next step, which rust-show "Show status and next step" also leaves out.

## Surface

- Added: Rust `osq show --json` (flag).

## Decisions

- ADR 022: the JSON is built inside the show crate from its own derivations; it calls no other feature and copies no code from the report crate's JSON writer.
- ADR 023: the JSON writer and members are pure functions over the model `show` already reads; the orchestrator in `feature.rs` only picks text or JSON.
- ADR 024: every public item ends its doc with `Implements: rust-show/<requirement>`, and each test names `Covers: rust-show/<scenario>`.
- ADR 025: markers, event streams and proposals are read as TypeScript writes them; nothing on disk changes.
- ADR 026: proposal and task files are read only through the specs kernel, as today.
- ADR 027: no scheduling changes.
- ADR 028: `ShowFeature` stays a unit struct; only the `show` command's usage changes, to `[--json] <id>`.
- ADR 029: `show` reads `osq.toml` through `load_config` only, and adds no key.

## Assumptions

- Every golden was printed by `golden/print-json-goldens.mjs.txt` with the built `dist` of this repository on 2026-10-24.
- No fixture task's scope holds a scenario test, so TypeScript prints no `scenarios` member in any golden.
- An event number that a 64-bit float cannot hold exactly prints as JavaScript prints its float; the fixtures hold none.

## Contract

### Requirement: Show JSON

See `specs/rust-show/spec.md`: MODIFIED "Show command" and "Show
arguments", ADDED "Show JSON".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-show/spec.md`: MODIFIED "Show command" for the usage `[--json] <id>`; MODIFIED "Show arguments" for `--json`, keeping "Show argument errors" and adding "Show JSON arguments"; ADDED "Show JSON" with three golden scenarios and the worktree scenario.
- Shared files: both tasks scope `crates/features/show/src/**`. Task 2 extends task 1's JSON module and the land readers; the watcher recertifies task 1 by its verify.
