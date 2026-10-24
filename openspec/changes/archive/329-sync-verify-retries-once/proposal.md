---
title: A red sync verify runs once more before stopping the change
depends_on: []
verify: node -e "const {execSync}=require('node:child_process');for (const c of ['pnpm verify','sh scripts/verify-rust.sh']) execSync(c,{stdio:'inherit'})"
features:
  reads: [watcher-and-harness, cli-foundation, spec-lint-and-approve, status-inspection, rust-core, rust-config, rust-harnesses]
---
## Goal

When land or sync merges the default branch into a change and the verify
fails, osq stops the change as a `sync_verify_red` regression that needs
steering, so a human must edit the plan and approve again. A test that fails
only sometimes, or one main has already fixed, costs that manual approve
though the plan is fine. On 2026-10-24, 319 stopped at land on the WSL
missing-program flake that 320 had fixed, and re-approving it needed a
made-up plan edit.

Now a red verify or check in the sync runs once more at once on the same
merged tree, in TypeScript and in Rust land. Only a second failure stops the
change, with the second run's output. When the second run passes, the
failed run stays in the change's events, so a flaky test still shows.

## Verify

`pnpm verify`, then `sh scripts/verify-rust.sh`

The first runs the TypeScript typechecks, build, tests and lint, including
the new `tests/vcs-sync-verify-twice.test.ts` for "Verify passes on its
second run" and "Verify red on both runs". The second runs the Rust format
check, clippy, every Rust test and the mutation check on the touched lines,
including the new `crates/features/land/tests/land_sync_verify_twice.rs` for
"Sync verify runs twice". Every existing sync test passes unchanged: a verify
that always fails still stops with its output.

## Non-goals

- More than one extra run, or a configurable count.
- Re-approving a default-branch stop with no plan edit; `rust-approve-default-branch-steering` covers that for Rust.
- The watcher's own task and change verifies; only the sync's step 5 runs twice.

## Surface

- Changed: a red verify or check during `osq sync`, `osq land` and the watcher's sync before a retry runs once more before the change stops with `sync_verify_red`.
- Changed: a sync whose second run passes records a `verify_ran` event with a non-zero `exitCode` for the first run.

## Decisions

- ADR 003: the second run happens before the merge is committed or aborted, so a stop still leaves the worktree's HEAD and tracked files as they were.
- ADR 006: the extra run is a fixed deterministic step, not a judgement; a second failure still stops the change.
- ADR 021: autopilot stops only when both runs fail, as it stops on any `sync_verify_red` today.
- ADR 022: Rust land keeps the retry inside its own sync step; no other crate changes.
- ADR 023: the Rust retry is one small named function around the existing run of one command.
- ADR 024: the Rust function's doc names "Land sync verify", and the test names "Sync verify runs twice".
- ADR 025: the failed run's `verify_ran` event and log use the formats every reader already parses.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: the Rust task locks only the land crate's sync verify.
- ADR 028: the land feature's commands stay as they are.
- ADR 029: the verify timeout and output limits still come from `load_config`.

## Assumptions

- A stop restores the change stream to what it held before the sync, as it does today, so the failed runs' events survive only when the second run passes. The stop's `regressed` record carries the second run's output.
- A verify that is slow and red now takes up to twice its time before the change stops.
- Every existing test whose sync verify fails, fails it on every run, so it still stops with the same message; no existing test counts verify runs or the logs of a failed sync.

## Contract

### Requirement: Default branch sync

See `specs/version-control/spec.md`: a failing step-5 command runs once
more before the sync stops.

#### Scenario: Verify passes on its second run
- **WHEN** the merged tree's verify fails once and then passes
- **THEN** the sync commits, and the change's events hold both runs

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/version-control/spec.md`: MODIFIED "Default branch sync", step 5 and two scenarios. Task 1.
- `specs/rust-land/spec.md`: MODIFIED "Land sync verify", and the scenario "Sync verify runs twice". Task 2.

No file is shared between tasks.
