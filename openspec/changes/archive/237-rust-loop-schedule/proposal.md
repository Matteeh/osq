---
title: The loop kernel builds the scheduler's input from change folders and gives every active change its state
depends_on: ["236"]
verify: sh scripts/verify-rust.sh
check: node --import tsx --import ./tests/git-test-env.ts --test tests/rust-adrs.test.ts
creates:
  - name: rust-loop
    group: rust
features:
  reads: [rust-storage, rust-specs, rust-workspace, cli-foundation, spec-lint-and-approve]
---
## Goal

Change 236 put ADR 027's scheduler in `osq-core` as a pure rule over plain
values. This change feeds it real repository data: the loop kernel reads
the active change folders and answers, for each one, whether it is running
or what core's scheduler says about it.

`scope_files(root, scope)` resolves a task's scope entries against the
repository's files, as TypeScript's `resolveScope` does: an exact entry
gives itself, a glob gives every file it matches, and a glob that matches
no file gives itself, so a change that will create files under a kernel
crate still locks that crate. `active_schedule(root)` reads every active
change with the storage kernel, takes its dependencies from its proposal,
treats an approved change with a done or started task as running, and
returns `Running` or core's `ScheduleState` for each active change, plus
the changes to start now.

The `osq-kernel-loop` crate leaves `rust-workspace` and becomes the
`rust-loop` capability. ADR 027's `checks` gains the loop's tests.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the loop's fixture tests and its corpus test over this
repository's active changes. The `check` reruns `tests/rust-adrs.test.ts`,
which proves ADR 027 names the loop's tests and that they exist.

## Non-goals

- Spawning agents, the `Feature` trait and hook registration, the broadcast wake-up channel, and landing; they come with the runners and feature crates.
- The overlap gate before land, and checking scopes again after a planner widens one.
- Any CLI or server surface for the states.
- Changing the TypeScript watcher or the storage and specs kernels.

## Surface

None

## Decisions

- ADR 022: `rust-loop` is a kernel crate on `osq-core`, `osq-kernel-storage` and `osq-kernel-specs`; it adds no external dependency and no feature crate calls it yet.
- ADR 023: `active_schedule` is the thin orchestrator holding the IO; the step from snapshots to core's input is small named pure functions, and every item has a doc comment.
- ADR 024: every public function's doc ends with `Implements: rust-loop/<requirement>`, every test names `Covers: rust-loop/<scenario>`, and ADR 027 names the loop's tests in `checks`.
- ADR 025: the loop reads today's change folders, `.run/approved`, `.run/done/<n>` and task streams through the storage kernel, and writes nothing.
- ADR 026: proposals and task files are parsed by the specs kernel, and scope globs match with its `scope_covers_path`.
- ADR 027: the loop calls core's `schedule` and decides nothing itself beyond what is running, which dependencies are done and which files each change holds.

## Assumptions

- A change is running when it is approved and at least one of its tasks has a `.run/done/<n>` marker or a `started` event. It keeps holding its files until it is archived, even when dead, regressed or done.
- A dependency is done when an archived change has that id or folder name. A dependency on an active, rejected or unknown change is not done.
- Every task of a change counts toward its files, done or not, and an unapproved change holds no files, since core reports it as needing approval first.
- A glob that matches no file standing for itself is new: TypeScript's `resolveScope` gives nothing for it. Without it, a change whose glob names files it will create under `crates/core/` or a kernel crate would not lock that crate.
- The corpus test reads this repository's active changes as they are when it runs. A task file that does not parse in any active change fails it, as a broken change folder already fails the storage kernel.

## Contract

### Requirement: Code ownership

See `specs/rust-loop/spec.md` and `specs/rust-workspace/spec.md`.

### Requirement: Scope files

See `specs/rust-loop/spec.md`.

### Requirement: Active schedule

See `specs/rust-loop/spec.md`.

### Requirement: Rust rebuild decisions

See `specs/rust-core/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-loop/spec.md`: new capability, ADDED "Code ownership", "Scope files" and "Active schedule".
- `specs/rust-workspace/spec.md`: MODIFIED "Code ownership", without `crates/kernel/loop/**`, scenario kept.
- `specs/rust-core/spec.md`: MODIFIED "Rust rebuild decisions" (ADR 027's checks row, scenarios kept).

Tasks 1 and 2 share `crates/kernel/loop/Cargo.toml`, `crates/kernel/loop/src/lib.rs` and `Cargo.lock`; task 2 runs after task 1.
