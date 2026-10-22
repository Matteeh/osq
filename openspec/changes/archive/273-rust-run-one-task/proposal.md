---
title: The Rust run feature runs one task end to end on pi
depends_on: ["269"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-storage, rust-specs, rust-vcs, rust-runners, rust-harnesses, rust-approve]
---
## Goal

The Rust pieces of a run exist one by one: the executor prompt, the runner,
pi, the verify command and the scope audit. Nothing yet joins them. This change
adds `RunFeature` to `osq-feature-run`. `run <id> <task>` runs one task of an
approved change once, in the checkout, on pi:

- It refuses what it cannot run, and checks the approval seal.
- It takes the task's lock and starts pi with the executor prompt.
- It audits the paths the start changed and judges the result file.
- It runs the task's verify and then the proposal's verify.
- It ends with TypeScript's done or dead markers and events.

That is the smallest loop the Rust watcher will later repeat.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints and every Rust test.
That includes the new run tests, which drive a committed fake pi through
every outcome on scratch git repositories.

## Non-goals

- Registering `run` in the Rust CLI. 271 changes the feature registry, so a later item adds it there.
- Retries, attempt numbers past 1, worktrees, preflight and the watcher loop.
- Baseline verify, measures events, `vcs_violation`, done marker metadata and the dead marker fingerprint.
- Writing a result file from the agent's final text.

## Surface

- Added: `run <id> <task>` (command of the Rust run feature, not yet registered in the CLI)

## Decisions

- ADR 022: the run feature depends only on core and kernel crates; the change lookup is its own code, not the approve feature's.
- ADR 023: tests live in the crate's `tests/` folder, and their fake pi is a committed fixture.
- ADR 024: every public item ends its doc with `Implements:` and every test names `Covers:`.
- ADR 025: markers and events keep TypeScript's frontmatter reasons and event shapes, so TypeScript readers see Rust runs as their own.
- ADR 026: the approval seal comes from the storage kernel's `change_folder_seal`.
- ADR 027: one run is one task; scheduling stays out of the feature.
- ADR 028: `RunFeature` is a unit struct implementing core's `Feature`.
- ADR 029: settings come from `osq.toml` through the config kernel.

## Assumptions

- Marker bodies are Rust's own text except where the delta gives TypeScript's bytes, such as `spec_conflict`.
- A scope violation kills the task in a checkout run, as it does in TypeScript when a run has a git root.
- Rust runs only pi for now; any other executor harness is refused.
- A usage limit fails the run with no marker, since pausing belongs to the watcher.

## Contract

The delta below is the contract.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-run/spec.md`: ADDED "Task checkbox tick", "Run feature", "Run refusals", "Run lock", "Run approval check", "Dead record", "Executor start", "Run scope audit", "Run verdict" and "Done record".

Shared files:
- `crates/features/run/src/lib.rs`: tasks 1 and 2.
- `crates/features/run/Cargo.toml`, `src/feature.rs`, `src/feature/**` and `tests/support/**`: tasks 2 and 3.
