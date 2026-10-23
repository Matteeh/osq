---
title: The Rust run feature refuses a bad worktree and halts when its commit fails
depends_on: ["301", "311"]
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-vcs, rust-specs, rust-storage, rust-retry]
---
## Goal

301 runs a task in its change's worktree without TypeScript's safety
checks: Rust `osq run` starts pi in a worktree that is off its branch or
dirty, and a failed task commit only fails the run, so nothing stops the
next run from building on a tree the branch never recorded. TypeScript
halts the change with `worktree_off_branch`, `worktree_dirty` or
`commit_failed`, commits pending done tasks before it checks the tree, and
after a `commit_failed` halt makes the missing commits on a later pass
within `gates.commitRetries`. This change ports those checks, the halt
record and the catch-up into the run feature, and gives the Rust config
a `gates` table with `commitRetries`.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves `gates.commitRetries` and its errors, both
worktree halts and the change's records they allow, the pending verified
commit, the `commit_failed` halt of a failed verified or dead commit, the
catch-up for both, its retry budget, the refusal of any other halt, and
that every earlier run and config test still holds.

## Non-goals

- Regressed and recertification commits, and stacked changes.
- TypeScript's other gates in `osq.toml`; only `commitRetries` is read.
- The archive's `commit_failed` halt and catch-up (310).
- A watcher pass: the catch-up runs only when a human runs `osq run`.

## Surface

- Added: `gates.commitRetries` in `osq.toml` (config key), with TypeScript's default 2.
- Added: the run refusal `Change <folder> is halted (<reason>); run osq retry <id> change`.
- Changed: Rust `osq run` halts a worktree change as `worktree_off_branch`, `worktree_dirty` or `commit_failed` (dead reasons TypeScript already writes).

## Decisions

- ADR 022: the halt record and the automatic retry are written by the run crate itself, copying rust-retry's "Retry record" rather than calling the retry feature.
- ADR 023: the pending-marker lists, the dirt list and the retry budget count are pure leaves; `refusals::check` calls one worktree step that holds the IO.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each new test names `Covers: <capability>/<scenario>`.
- ADR 025: `.run/regressed/change.md`, the `regressed` and `retry` events and the commits take TypeScript's formats.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes; the change waits on 311, which also writes the run crate.
- ADR 028: `RunFeature`'s commands are unchanged.
- ADR 029: `gates` is read in the config kernel with TypeScript's default and a typed error for a bad or unknown key.

## Assumptions

- The catch-up and the worktree checks run before the marker refusals, so `osq run <id> <n>` of a task that is already done or dead still makes the missing commit and clears a `commit_failed` halt before it refuses that task; otherwise a halt on the last task could never be caught up.
- A halt other than `commit_failed`, or one past its budget, refuses the run until a human runs `osq retry <id> change`, as TypeScript's watcher leaves such a change alone; the refusal text is new, since TypeScript has no command that hits it.
- The catch-up keeps a dead task's `.run/dead/<n>.patch` that already exists, where TypeScript's `commitDeadTask` rewrites it from the now-cleaned tree and loses the agent's patch.
- Worktree tests now list `fake-pi-mode` in `.git/info/exclude`, and `an_untracked_test_file_is_committed` uses the fake pi's `added-test` mode with `src/tests/new.rs` in its scope, since a file written before the run now halts it as `worktree_dirty`. A scratch run of the dirty check found no other failing test.

## Contract

### Requirement: Gate settings

See `specs/rust-config/spec.md`, "Gate settings" and the MODIFIED
"Config file".

### Requirement: Worktree halt, Worktree checks and Commit catch-up

See `specs/rust-run/spec.md`, with the MODIFIED "Run refusals",
"Verified task commit" and "Dead task commit".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-config/spec.md`: ADDED "Gate settings"; MODIFIED "Config file", whose "Unknown top-level key" now uses `[server]`.
- `specs/rust-run/spec.md`: ADDED "Worktree halt", "Worktree checks", "Commit catch-up"; MODIFIED "Run refusals", "Verified task commit", "Dead task commit".
- Shared files: task 3 extends `crates/features/run/src/feature.rs`, `crates/features/run/src/feature/refusals.rs` and `crates/features/run/src/feature/commit.rs`, which task 2 owns through `crates/features/run/src/**`.
