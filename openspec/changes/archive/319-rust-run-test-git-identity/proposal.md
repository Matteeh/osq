---
title: The run feature's worktree tests pass on a machine with no global git identity
depends_on: []
verify: sh scripts/verify-rust.sh
features:
  reads: [rust-vcs]
---
## Goal

GitHub's Rust CI fails run tests on main with `Committer identity
unknown`. osq commits with only `--author`, as TypeScript does, so git
takes the committer from its config, and the CI runner has none. The
run crate's worktree test repositories should carry their own identity,
as the land crate's test repositories already do.

Measured on 2026-10-23 with an empty `HOME` and `GIT_CONFIG_NOSYSTEM=1`:
15 tests in 5 run test binaries (`run_worktree`, `run_worktree_dead`,
`run_worktree_halts`, `run_worktree_tree`, `run_commit_catch_up`) fail
on main, and all of them pass once `build` in
`crates/features/run/tests/worktree_support/mod.rs` sets `user.name` and
`user.email` after `git init`. Every other workspace test already passes
that way.

## Verify

`sh scripts/verify-rust.sh` runs the format check, clippy with pedantic
lints, and every Rust test. With the task's own verify, which runs the
run crate's tests with no global git identity, it proves the worktree
tests no longer depend on the machine's git config.

## Non-goals

- Setting a committer in the vcs kernel's `commit`.
- Other crates' tests; none fails the same check.
- Any change to the run feature's code.

## Surface

None

## Decisions

- ADR 022: no feature code changes; only the run crate's test support and one new test.
- ADR 023: the test helper keeps a one-line doc comment; no lint is loosened.
- ADR 024: no public item changes; the new test names `Covers: rust-run/worktree-test-repository-identity`.
- ADR 025: no on-disk format changes.
- ADR 026: no OpenSpec parsing changes.
- ADR 027: no scheduling changes; the change writes only run crate tests.
- ADR 028: `RunFeature`'s commands are unchanged.
- ADR 029: no config changes.

## Assumptions

- The watcher's verify runs through a shell with `HOME` set, so the task's verify can derive `CARGO_HOME` and `RUSTUP_HOME` from it before it replaces `HOME`.
- Land's sync verify on 2026-10-24 failed only in `commit_writes_with_a_program_that_cannot_start`, the WSL missing-program flake that 320 fixed on main by naming the program by an absolute path. Merging main brings that fix; the plan is otherwise unchanged.

## Contract

### Requirement: Worktree run

See `specs/rust-run/spec.md`: the run tests' scratch repository carries
its own git identity, with the new scenario "Worktree test repository
identity".

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-run/spec.md`: MODIFIED "Worktree run", adding the scenario "Worktree test repository identity".
