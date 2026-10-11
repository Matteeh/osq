# Spec Delta: version-control

## ADDED Requirements

### Requirement: Land stops recover to a landed change
An archived change whose `osq land` stopped with `sync_conflict` or
`sync_verify_red` SHALL land once a planner revises its plan in the worktree's
archive folder, a human runs `osq approve <id>`, and the watcher runs it
again, with no git command run by hand. The scenarios below are proven end
to end in a temporary git repository with a fake executor, through
`approveCommand`, `landCommand` and `runWatcherOnce`, each starting from the
stopped land and ending with `osq land <id>` exiting 0.

#### Scenario: Conflict at land steered
- **WHEN** an archived one-task change and the default branch both changed the same line of `src/one.txt`, `osq land <id>` runs twice, a planner edits `tasks/1.md` in the worktree's archive folder, a human runs `osq approve <id>`, `osq watch --once` runs, and the human runs `osq land <id>`
- **THEN** the first land exits 1, the second exits non-zero without landing, `osq approve` prints `Restarted from main`, task 1 spawns again, and the last land exits 0 with the restarted attempt's `src/one.txt` on the default branch

#### Scenario: Red verify at land steered
- **WHEN** the default branch adds `src/two.txt` holding `bad`, which makes an archived one-task change's `verify` exit 1 on the merged tree, `osq land <id>` runs, a planner adds task 2 with scope `src/two.txt` in the worktree's archive folder, a human runs `osq approve <id>`, `osq watch --once` runs, and the human runs `osq land <id>`
- **THEN** the first land exits 1, `osq approve` prints `Merged main into osq/<folder>` and `Continues from task 2`, task 1 does not spawn again, task 2 spawns, and the last land exits 0 with task 2's `src/two.txt` on the default branch
