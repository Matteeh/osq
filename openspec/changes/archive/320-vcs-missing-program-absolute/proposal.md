---
title: Missing-program tests in both languages name the program by an absolute path
depends_on: []
verify: pnpm verify
features:
  reads: [version-control, cli-foundation, spec-lint-and-approve]
---
## Goal

On 2026-10-23 change 311 halted at archive on
`branch_and_worktree_writes_with_a_program_that_cannot_start`, a vcs
kernel test 311 never touched: the spawn error was `InputOutputError`
instead of `NotFound`. The tests start `osq-missing-git` by bare name, so
the OS searches every `PATH` folder for it. Under WSL that includes 19
Windows folders under `/mnt/` that now and then answer with an I/O
error, which ends the search with that error. The same day `osq land
313` failed its sync verify on `tests/vcs-doctor.test.ts` "warns that
git is not found without failing" with `spawn EIO`, for the same reason.
Every change's verify runs these tests, so any change can halt on them.

A program named by a path is started directly, with no `PATH` search,
so its error is always `NotFound`. This change makes every
missing-program test, in Rust and TypeScript, name its program as
`/nonexistent/<name>`, and makes the six rust-vcs scenarios that pin
the program's command text name that path.

## Verify

`pnpm verify` runs the CLI and UI typechecks, the build, every
TypeScript test and lint. The Rust task's verify, `sh
scripts/verify-rust.sh`, runs the format check, clippy and every Rust
test. Together they prove each missing-program test still asserts its
error kind or message and its exact command text with the absolute
program path.

## Non-goals

- Any change to `GitVcs`, `selectVcs`, `checkGit` or how either
  language starts git.
- WSL settings.
- Tests that start a missing program by a path already, such as the
  doctor and pi tests with `/nonexistent/pi`.

## Surface

None

## Decisions

- ADR 022: no feature or kernel code changes; only kernel vcs tests and their spec tables.
- ADR 023: the changed tests keep their doc comments; no lint is loosened.
- ADR 024: no `Implements:` or `Covers:` line changes; the tests keep covering the same scenarios.
- ADR 025: no on-disk format changes.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes.
- ADR 028: no feature commands change.
- ADR 029: no config changes.

## Assumptions

- The flake could not be reproduced on 2026-10-23 while planning: 30 runs of the vcs kernel's `cannot_start` tests passed both before and after the change with 19 `/mnt/` folders on `PATH`. The fix rests on 311's measurement (4 of 30 failed) and on a path never being searched.
- A scratch run of this exact change passed every vcs kernel test and `tests/vcs.test.ts`, `tests/vcs-doctor.test.ts` and `tests/doctor.test.ts` unchanged otherwise.
- A search of `tests/` and `crates/` found no other test that starts a missing program by bare name.

## Contract

### Requirement: Git command, History reads, Branch and worktree writes, Commit writes, Merge writes, Setup reads

See `specs/rust-vcs/spec.md`: each "... with a program that cannot
start" scenario names `/nonexistent/osq-missing-git` in its WHEN and
command table. Nothing else in those requirements changes.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`: MODIFIED "Git command", "History reads", "Branch and worktree writes", "Commit writes", "Merge writes" and "Setup reads", each only renaming the program in its program-that-cannot-start scenario.
