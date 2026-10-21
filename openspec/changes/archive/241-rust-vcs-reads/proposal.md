---
title: "The vcs kernel reads a git repository the way osq's Vcs port does: head, status, refs, merge base and diffs"
depends_on: ["239"]
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

Land, sync, approve and the loop all need git, and `crates/kernel/vcs` is
still a placeholder. This change gives the vcs kernel the read half of
osq's `Vcs` port, so features that only read can be built on it while the
write half follows.

`osq-kernel-vcs` gains the `Vcs` trait and `GitVcs`, which runs the `git`
program with the arguments and parsing of TypeScript's `GitVcs`
(`src/core/vcs/git-vcs*.ts`). Fourteen reads come over: `root`, `head`,
`status`, `config_value`, `default_branch`, `show`, `path_exists`,
`list_branches` and `worktree_list` read the repository's state, and
`merge_base`, `is_ancestor`, `count_commits`, `diff_stat` and
`trailer_values` read its history. A path, branch or ref that does not
exist gives the empty or `None` answer TypeScript gives; a program that
cannot start is a typed `VcsError` naming the command.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the command builder test, the missing-program tests, and the
read tests on the state, unborn, outside and history repositories each
test builds under `CARGO_TARGET_TMPDIR`.

## Non-goals

- Any write: commit, commit-tree, merge, stage, discard, patch, branch create or rename, worktree add, remove or prune, fetch, push.
- `NoVcs`, choosing between it and `GitVcs`, doctor checks, hook names, stashes, the index digest and line endings.
- A timeout on git reads; TypeScript bounds them with `timeouts.gitSeconds`, which reaches Rust with `osq.toml`.
- Any caller: no feature, loop or CLI code uses the trait yet.
- Changing the TypeScript `GitVcs`.

## Surface

None

## Decisions

- ADR 022: `osq-kernel-vcs` is a kernel crate on `osq-core` only; it adds no dependency, and no feature calls it yet.
- ADR 023: the `Vcs` trait has one implementation now; the test doubles features will use and the `NoVcs` that follows are its others, as section 3 allows for a test double. Parsers are pure private leaves, and only the runner in `git.rs` spawns.
- ADR 024: every public function's doc ends with `Implements: rust-vcs/<requirement>`, and every test names `Covers: rust-vcs/<scenario>`.
- ADR 025: the reads take today's repositories as they are, with TypeScript's arguments, and write nothing.
- ADR 026: no OpenSpec parsing is involved; the kernel reads only git.
- ADR 027: the kernel decides nothing about scheduling; it gives later merge-base and diff checks their data.

## Assumptions

- Only a program that cannot start is a `VcsError`. A git that exits with a code other than 0, for a bad ref, a missing path or a directory outside any repository, gives TypeScript's empty answer, as the brief's "same empty or `None` answer" asks.
- Every read passes `-c core.quotepath=false`, where TypeScript passes it only to `patch`. None of these reads prints a quoted path on git 2.34, so answers match, and later reads that name paths get raw ones.
- An unborn worktree's `head` is `Some("0000000000000000000000000000000000000000")`, as TypeScript's parser gives, although TypeScript's doc comment says null.
- The API is synchronous on `std::process`; no async runtime is added.
- Tests need git 2.32 or later for `GIT_CONFIG_GLOBAL`; this machine has 2.34.
- If change 240 lands ADR 028 before this change is approved and lint asks for it, `## Decisions` gains "ADR 028: no feature crate is written, so no `Feature` is exposed."

## Contract

### Requirement: Git command

See `specs/rust-vcs/spec.md`.

### Requirement: Repository state reads

See `specs/rust-vcs/spec.md`.

### Requirement: History reads

See `specs/rust-vcs/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`: ADDED "Git command", "Repository state reads" and "History reads".

Tasks 1 and 2 share `crates/kernel/vcs/src/lib.rs`, `crates/kernel/vcs/src/port.rs` and `crates/kernel/vcs/src/git.rs`; task 2 runs after task 1.
