---
title: The Rust run feature runs a task in its change's worktree and commits it
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-core, rust-config, rust-storage, rust-harnesses, rust-runners, rust-approve]
---
## Goal

With git on, an approved change lives in its own osq worktree on
`osq/<folder>`, so parallel changes never share a tree. TypeScript runs
each task there and commits the outcome on the branch: a verified task's
scoped files and records, or a dead task's records with the agent's work
saved as a patch and discarded. Rust `run` (273) works only in the
checkout, so it cannot run any approved change once git is on. This
change makes Rust `run` find the change across the osq worktrees, run the
executor, the scope audit and both verifies in that worktree, and commit
the done or dead task with TypeScript's message, files and trailers. A
usage pause there discards the executor's files outside the change folder
as TypeScript does. The vcs kernel gains the `patch` and `discard` writes
the dead commit and the pause need.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, every Rust test, the link gates and the mutation check of the
changed lines. It proves that `patch` and `discard` behave as
TypeScript's on scratch repositories, that a task in a worktree runs
there and its done or dead commit holds TypeScript's paths and message,
that a failed commit fails the run and keeps the records, and that every
earlier run test, all in the checkout, still holds.

## Non-goals

- Stacked changes and the baseline verify; `rust-run-baseline-verify` follows.
- TypeScript's worktree preconditions before a spawn, `worktree_off_branch` and `worktree_dirty`, and its `commit_failed` halt and catch-up; a failed commit fails the run instead.
- Regressed tasks and recertification commits.

## Surface

- Changed: `osq-rs run <id> <task>` (command): with git on, it runs a task in its change's worktree and commits the outcome on `osq/<folder>`

## Decisions

- ADR 003: osq alone writes to git; the executor still never runs git, and `discard` touches only an osq worktree on an `osq/` branch.
- ADR 022: worktree runs stay in the run feature crate and reach git through the vcs kernel; the tree lookup is written in this crate, as archive and reject write theirs.
- ADR 023: path choice, the outcome line and the commit message are pure functions; the orchestrator calls git.
- ADR 024: every public item ends its doc with `Implements: <capability>/<requirement>`, and each new test names `Covers: <capability>/<scenario>`.
- ADR 025: markers, events, the dead patch and the commit message are written as TypeScript writes them.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes; one run is one task.
- ADR 028: `run` stays the one command of `RunFeature`.
- ADR 029: `vcs.enabled`, `vcs.author` and `timeouts` come from `load_config`.

## Assumptions

- A failed task commit fails the run with the error, as Rust archive does since 295; TypeScript instead halts the change as `commit_failed` and catches up later, which a later item can port with the worktree preconditions.
- The verified commit's in-scope paths are those the Rust scope audit already counts as in scope, its lock rules included, which stands in for TypeScript's `scopeCoversChangedPath`; untracked test files are those under the audit's test folders, which stand in for TypeScript's `isGatedTestPath`.
- Commit messages are checked against TypeScript's format with the elapsed seconds masked, not against TypeScript goldens, because they hold a run time.

## Contract

### Requirement: Worktree run

See `specs/rust-run/spec.md`, with "Worktree run", "Verified task
commit", "Task commit message", "Dead task commit" and "Paused worktree
discard", and `specs/rust-vcs/spec.md`, with "Patch and discard".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`: ADDED "Patch and discard".
- `specs/rust-run/spec.md`: ADDED "Worktree run", "Verified task commit", "Task commit message", "Dead task commit" and "Paused worktree discard".
- Tasks 2, 3 and 4 share `crates/features/run/src/**`, and tasks 2, 3 and 4 share `crates/features/run/tests/worktree_support/**`; each depends on the one before it.
- Steered 2026-10-23: the old task 2 timed out twice, so it is split into task 2, the worktree lookup and run, and task 3, the verified commit; the old task 3 is now task 4.
