---
queue_item: rust-run-test-git-identity
queue_hash: sha256:0ec5b18e017cbbc05d92ae37e9d31c4380f61496e7cef2947f33838f96a436ad
planner: null
date: 2026-10-23
---

### Goal

GitHub's Rust CI fails five run tests on main (`verified_task_commit`, `trailers_from_the_last_started_event`, `an_untracked_test_file_is_committed`, `dead_task_commit`, `worktree_run_finds_its_tree`) with `Committer identity unknown`. osq commits with only `--author`, as TypeScript does, so git takes the committer from its config, and the runner has none. The test repositories should carry their own identity, as the land crate's tests already do.

### Context

As of 2026-10-23:

- `build` in `crates/features/run/tests/worktree_support/mod.rs` runs `git init` and commits through `support::git`, which sets the committer only through the environment of its own git calls; the run feature's own commits don't get it.
- `crates/features/land/tests/support/mod.rs` sets `user.name` and `user.email` in the repository with `git config`.
- A scratch run with an empty `HOME` and `GIT_CONFIG_NOSYSTEM=1` reproduced all five failures, and adding `git config user.name "Osq Test"` and `git config user.email osq@example.com` after `git init` in `build` made every run test pass.
- 312 also edits `build` after `git init`, so this waits for it.

### Requirements

- `build` gives the test repository its own `user.name` and `user.email`.
- Every run crate test passes with an empty `HOME` and `GIT_CONFIG_NOSYSTEM=1`.

### Non-goals

- Setting a committer in the vcs kernel's `commit`.
- Other crates' tests, unless the same check finds one failing.
