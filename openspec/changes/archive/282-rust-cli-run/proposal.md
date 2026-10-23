---
title: The Rust CLI registers the run feature, so osq run works from the binary
depends_on: ["273"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-run]
---
## Goal

`rust-run-one-task` (273) added `RunFeature` but left it out of the CLI
registry, because 271 was editing that registry at the same time. Until it is
registered, the `osq-rs` binary has no `run` command. This change adds
`RunFeature` to `features()`, so the top-level help lists `run` and
`osq-rs run <id> <task>` reaches the run feature.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic lints,
every Rust test with the link gates, and cargo-mutants on the changed lines.
It proves the registry lists `run` in its place and that `run` dispatched
through the CLI returns the run feature's own errors.

## Non-goals

- Any change to how the run feature runs a task, its texts or its refusals.
- Any change to help or dispatch logic in `run_cli`.

## Surface

- Added: `osq-rs run <id> <task>` (command of the Rust binary)

## Decisions

- ADR 022: the app crate only lists features; `osq-cli` already depends on `osq-feature-run`, and no feature calls another.
- ADR 023: the one changed function keeps its doc comment; no new items are added to `src/`.
- ADR 024: the registry keeps `Implements: rust-cli/feature-registry`, and the new test names `Covers: rust-cli/run-through-the-registry`.
- ADR 025: no on-disk format changes; the dispatch test writes nothing.
- ADR 026: no spec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: help and dispatch read `RunFeature`'s `Command` data as they read every other feature's.
- ADR 029: no config is read by the CLI; the run feature reads `osq.toml` itself.

## Assumptions

- `RunFeature` goes after `ApproveFeature`, matching the plan, approve, run, archive, land order of the workflow and of `osq-cli`'s `Cargo.toml`, so the help lists `run` third.
- No other registered feature lists a `run` command, so dispatch reaches `RunFeature`.

## Contract

### Requirement: Feature registry

See `specs/rust-cli/spec.md`: the registry gains `RunFeature` after
`ApproveFeature`, and a new scenario proves `run` dispatches to it.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-cli/spec.md`: MODIFIED "Feature registry" (registry order gains `run`; ADDED scenario "Run through the registry").
