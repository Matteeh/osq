---
queue_item: vcs-missing-program-absolute
queue_hash: sha256:97b582ab124723384231b253e0f4feda9f9ea5c6ee62155397dae29506267509
planner: null
date: 2026-10-23
---

### Goal

On 2026-10-23 change 311 halted at archive on `branch_and_worktree_writes_with_a_program_that_cannot_start`, a vcs kernel test 311 never touched: the spawn error was `InputOutputError` instead of `NotFound`. The tests start `osq-missing-git` by bare name, so the OS searches every `PATH` folder for it, and under WSL that includes 19 Windows folders under `/mnt/` that now and then answer with an I/O error, which ends the search with that error. Measured in 311's worktree: 4 of 30 runs failed with the full `PATH`, 0 of 30 with the `/mnt/` folders removed. Every change's verify runs these tests, so any change can halt on them. The same day `osq land 313` failed its sync verify on the TypeScript test `tests/vcs-doctor.test.ts` "warns that git is not found without failing" with `spawn EIO`, for the same reason.

### Context

As of 2026-10-23:

- Six files in `crates/kernel/vcs/tests/` use `with_program("osq-missing-git")`: `setup_reads.rs`, `history_reads.rs`, `branch_and_commit_writes.rs`, `merge_writes.rs`, `git_command.rs`, `tree_record.rs`.
- TypeScript tests start missing programs by bare name too: `gitBinary: 'osq-definitely-not-a-real-binary'` in `tests/vcs-doctor.test.ts` (twice) and `tests/vcs.test.ts`, and `opencode: { bin: 'osq-missing-bin-xyz' }` in `tests/doctor.test.ts`. Check for others with the same shape.
- The rust-vcs spec pins the program in the command tables of the six "... with a program that cannot start" scenarios, such as `osq-missing-git -c core.quotepath=false branch osq/new main`.
- A program given with a path is started directly, with no `PATH` search, so its error is always `NotFound`.

### Requirements

- Every missing-program test names a program by an absolute path that cannot exist, such as `/nonexistent/osq-missing-git`, and still asserts `NotFound` and the exact command text.
- The six rust-vcs scenarios' tables name that program.
- The TypeScript tests that start a missing program do the same and keep their assertions.
- The tests pass 30 runs in a row with the `/mnt/` folders on `PATH`.

### Non-goals

- Any change to `GitVcs` or how it starts git.
- WSL settings.
