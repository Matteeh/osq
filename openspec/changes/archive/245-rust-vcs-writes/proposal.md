---
title: "The vcs kernel writes git as osq's Vcs port does: stage, commit, branches, worktrees and merges"
depends_on: ["241"]
verify: sh scripts/verify-rust.sh
features:
  reads: []
---
## Goal

Land, sync and the run feature all write git, and `osq-kernel-vcs` holds
only the read half of osq's `Vcs` port. This change gives it the write
half, so those features can be built on Rust.

The `Vcs` trait and `GitVcs` gain eleven writes with the git arguments,
author handling and results of TypeScript's `GitVcs`
(`src/core/vcs/git-vcs-write.ts`, `git-vcs-merge.ts` and
`git-vcs-land.ts`): `create_branch`, `rename_branch`, `worktree_add`,
`worktree_remove` and `worktree_prune` write branches and worktrees;
`stage`, `commit` and `commit_tree` write the index and commits; `merge`,
`merge_abort` and `fast_forward` merge. A merge is clean or a conflict
with its paths, and a fast-forward is done with its changed paths or
blocked by the uncommitted paths it would overwrite. A command git refuses
is the new `VcsError::Failed`, holding git's output, and no write passes a
force, reset, rebase or amend option.

## Verify

`sh scripts/verify-rust.sh`

It runs the format check, clippy with pedantic lints, every Rust test with
the corpus tests, and the mutation check on the lines this change touches.
That covers the missing-program tests and the write tests on the scratch
repositories each test builds under `CARGO_TARGET_TMPDIR`: a clean merge,
a conflicting merge and its abort, a blocked and a refused fast-forward,
and a worktree added, listed, refused, removed and pruned.

## Non-goals

- `push`, `fetch` and remotes; land, sync and their logic, which belong to features.
- `discard`, `patch`, stashes, hook names, the index digest and line endings.
- `NoVcs`, choosing between it and `GitVcs`, and doctor checks.
- A timeout on git commands; TypeScript bounds them with `timeouts.gitSeconds` and `timeouts.gitCommitSeconds`, which reach Rust with `osq.toml`.
- Any caller: no feature, loop or CLI code uses the writes yet.
- Changing the TypeScript `GitVcs` or the reads of change 241.

## Surface

None

## Decisions

- ADR 022: `osq-kernel-vcs` stays a kernel crate on `osq-core` alone; it adds no dependency, `Cargo.toml` and `Cargo.lock` do not change, and no feature calls the writes yet.
- ADR 023: the writes go on the existing `Vcs` trait; the author split, the conflict list and the blocked paths are pure private leaves, and only the runner in `git.rs` spawns.
- ADR 024: every public function's doc ends with `Implements: rust-vcs/<requirement>`, and every test names `Covers: rust-vcs/<scenario>`.
- ADR 025: the writes leave the repository as TypeScript's do, so either osq reads what the other wrote.
- ADR 026: no OpenSpec parsing is involved; the kernel writes only git.
- ADR 027: the kernel decides nothing about scheduling; this change's scope is `crates/kernel/vcs` alone.
- ADR 028: no feature crate is written, so no `Feature` is exposed.

## Assumptions

- `commit` and `commit_tree` pass `-F -` and give the message on standard input, where TypeScript writes it to a temporary file and passes `-F <file>`. Both keep the message out of the arguments and git reads it the same way; standard input needs no temporary file and keeps every command fixed, so the tests can name it.
- `fast_forward` reads `status()` itself, as TypeScript's `GitVcs.fastForward` does before calling its helper.
- The committer's name and email come from git config or the `with_env` pairs, as in TypeScript; the tests set `GIT_COMMITTER_NAME`, `GIT_COMMITTER_EMAIL` and the dates through `with_env`.
- Adding `VcsError::Failed` makes the irrefutable `let VcsError::Spawn { .. }` in `tests/git_command.rs` and `tests/history_reads.rs` refutable, so task 1 changes only those lines to `let ... else`, with `tests.modify: true`.
- Failure rows check that git's output contains a phrase of git 2.34's message rather than the whole message, so a newer git's wording around it does not break them.

## Contract

### Requirement: Git command

See `specs/rust-vcs/spec.md`.

### Requirement: Branch and worktree writes

See `specs/rust-vcs/spec.md`.

### Requirement: Commit writes

See `specs/rust-vcs/spec.md`.

### Requirement: Merge writes

See `specs/rust-vcs/spec.md`.

## Human steps

### Before approval

None

### After landing

None

## Delta

- `specs/rust-vcs/spec.md`: MODIFIED "Git command"; ADDED "Branch and worktree writes", "Commit writes" and "Merge writes".

Tasks 1 and 2 share `crates/kernel/vcs/src/lib.rs`, `crates/kernel/vcs/src/port.rs` and `crates/kernel/vcs/src/git.rs`; task 2 runs after task 1.
