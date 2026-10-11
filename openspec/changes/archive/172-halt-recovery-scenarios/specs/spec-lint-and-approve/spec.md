# Spec Delta: spec-lint-and-approve

## ADDED Requirements

### Requirement: Approval resumes a halted run
With `vcs.enabled` on and `GitVcs` selected, a change that the watcher halted
with a steering trigger SHALL run again and land once a planner revises its
plan in the worktree and a human runs `osq approve <id>`, with no git command
run by hand. The scenarios below are proven end to end in a temporary git
repository with a fake executor, through `approveCommand`, `landCommand` and
`runWatcherOnce`, each starting from the halt as a run produces it and ending
with `osq land <id>` exiting 0.

#### Scenario: Sync conflict restarted from the default branch
- **WHEN** the default branch changes the same line of `src/one.txt` while the only task of a change in a worktree runs, the watcher halts the change before archive, a planner edits `tasks/1.md` in the worktree, a human runs `osq approve <id>`, `osq watch --once` runs, and the human runs `osq land <id>`
- **THEN** `.run/regressed/change.md` had reason `sync_conflict`, `osq approve` prints `Restarted from main; kept the old branch as osq/<folder>-restarted-1` and `Continues from task 1`, task 1 spawns once more, and `osq land` exits 0 with the restarted attempt's `src/one.txt` on the default branch

#### Scenario: Failed check at archive steered
- **WHEN** a change's `check: node check.cjs` exits 1 at archive because `src/two.txt` is missing, a planner adds task 2 with scope `src/two.txt` in the worktree, a human runs `osq approve <id>`, `osq watch --once` runs, and the human runs `osq land <id>`
- **THEN** `.run/regressed/change.md` had reason `verify_red`, `osq approve` prints `Continues from task 2`, task 1 does not spawn again, task 2 spawns, and `osq land` exits 0 with `src/two.txt` on the default branch
