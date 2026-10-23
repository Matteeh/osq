---
title: The Rust osq binary dispatches each command to the feature that declares it
depends_on: []
verify: sh scripts/verify-rust.sh
creates:
  - name: rust-cli
    group: rust
features:
  reads: [rust-core, rust-plan, rust-approve, rust-archive, rust-land, rust-inbox, rust-report]
---
## Goal

`crates/apps/cli/src/main.rs` is an empty `fn main() {}`, so no Rust feature can be run from a shell. The `osq-rs` binary should hold the registry of the features that exist, run a command line through the feature that lists the command, print its output or typed error, and exit with the right code. Help comes from the features' `Command` data, as ADR 028 sets out.

The CLI crate is the last placeholder in rust-workspace. This change gives it its own capability, rust-cli, and removes rust-workspace's Code ownership, which leaves rust-workspace empty, so archive removes it.

The first run showed that the change link gates ignore a REMOVED `Code ownership`, so during this change's own run every new CLI file looked owned by both rust-workspace and rust-cli. Task 1 fixes the gate first: a capability whose delta removes its ownership owns nothing during the run, as archive will leave it.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, `cargo clippy` with `-D warnings` and pedantic lints, and every Rust test. That includes the new `osq-cli` tests, which drive `run_cli` with test features and run the built `osq-rs` binary for `inbox`, `queue` and `query` on copies of a fixture project.

## Non-goals

- JSON output, shell completion and forwarding to an osq server.
- Commands of features that do not exist yet, such as run and metaloop.
- Matching TypeScript's `commander` help and error texts. The Rust binary prints the features' own `Command` data and `FeatureError` displays.
- Finding the project root above the current directory. Like TypeScript's commands, the binary runs against the current directory.

## Surface

- Added: the `osq-rs` binary's `--help` and `-h`, top level and per command, and its exit codes 0 and 1.

## Decisions

- ADR 022: the app crate holds no workflow logic; it only lists the features and dispatches to them. It already depends on every feature crate, so no dependency and no `Cargo.lock` line changes.
- ADR 023: `run_cli` is pure: it returns stdout, stderr and the code, and `main` is the thin orchestrator that holds the IO.
- ADR 024: every public item ends its doc with `Implements: rust-cli/<requirement>`, and every test names `Covers: rust-cli/<scenario>`.
- ADR 025: no on-disk format changes; the binary reads through the features as they are.
- ADR 026: nothing here parses OpenSpec.
- ADR 027: nothing here schedules.
- ADR 028: dispatch picks the first feature whose `commands()` lists the name, and help is built only from `Command` data.
- ADR 029: the binary reads no config; each feature loads what it needs.

## Assumptions

- Task 2 is the first run's CLI task, unchanged except for its number. The worktree was reset when that task died, so its code is written again; the dead marker still holds the first attempt's diff.
- A capability whose delta both removes and re-adds `Code ownership` keeps the re-added globs; only a removal with no replacement empties it.
- The binary keeps its name, `osq-rs`, from `crates/apps/cli/Cargo.toml`, so it never shadows the TypeScript `osq` on a `PATH`.
- Every feature error exits 1, the code TypeScript's `CommandError` uses by default. Separate exit codes for usage errors can come later.
- `query` writes its cache folder into the project root, so the binary tests copy the fixture project into a new folder under `CARGO_TARGET_TMPDIR` for every run, as data, never as an executable.
- `ApproveFeature`, `ArchiveFeature`, `LandFeature` and `ReportFeature` are unit structs; `PlanFeature` and `InboxFeature` are built with `new()`.
- Removing rust-workspace's only requirement removes the capability at archive, through watcher-and-harness's "Emptied capability removed". No code or test outside `openspec/` names rust-workspace.

## Contract

### Requirement: Change ownership

See `specs/rust-linter/spec.md`.

### Requirement: Code ownership

See `specs/rust-cli/spec.md`.

### Requirement: Feature registry

See `specs/rust-cli/spec.md`.

### Requirement: Command line result

See `specs/rust-cli/spec.md`.

### Requirement: CLI help

See `specs/rust-cli/spec.md`.

### Requirement: Command dispatch

See `specs/rust-cli/spec.md`.

### Requirement: CLI entry point

See `specs/rust-cli/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-cli/spec.md` and `specs/rust-cli/osq.yml`: new capability rust-cli in group `rust`, ADDED "Code ownership", "Feature registry", "Command line result", "CLI help", "Command dispatch" and "CLI entry point".
- `specs/rust-workspace/spec.md`: REMOVED "Code ownership", its only requirement.
- `specs/rust-linter/spec.md`: MODIFIED "Change ownership", which keeps its three scenarios and adds "A change removes a capability's ownership" and "Removed ownership with no new owner".

The two tasks share no file; task 1 runs first so the proposal's verify can pass after task 2.
