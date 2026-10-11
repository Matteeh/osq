# Spec Delta: watcher-and-harness

## ADDED Requirements

### Requirement: Task failures recover to a landed change
With `vcs.enabled` on, a change in a worktree whose task dies, sticks,
loses its watcher, or halts SHALL run again and land through `osq retry`,
`osq approve`, `osq watch` and `osq land` alone, with no git or marker
written by hand. Tests prove each scenario below in a temporary git
repository with a fake executor, from the failure as a run produces it to
`osq land <id>` exiting 0.

#### Scenario: Dead task retried by a human
- **WHEN** task 1 of a one-task change in a worktree dies with `verify_red` while `gates.autoRetries` is 0, a human runs `osq retry <id> 1`, `osq watch --once` runs, and the human runs `osq land <id>`
- **THEN** the executor spawned twice, the archived folder holds `.run/dead/1.1.md` and `.run/done/1`, `osq land` exits 0, and `src/one.txt` on the default branch holds the second attempt's content

#### Scenario: Stuck task steered
- **WHEN** with `gates.autoRetries` of 1 task 1 dies twice with the same output, a planner edits `tasks/1.md` in the worktree, a human runs `osq approve <id>`, `osq watch --once` runs, and the human runs `osq land <id>`
- **THEN** the second dead marker has `stuck: true` and another `osq watch --once` spawns nothing before approval, `osq approve` prints `Continues from task 1`, the executor spawned a third time, and `osq land` exits 0 with the third attempt's `src/one.txt`

#### Scenario: Killed watcher's task resumed
- **WHEN** a watcher process running task 1 is killed with `SIGKILL` after the executor wrote part of `src/one.txt`, with `gates.autoRetries` of 1, and a human runs `osq retry <id> 1`, then `osq watch --once` runs and the human runs `osq land <id>`
- **THEN** `osq retry` exits 1 with `Task 1 was left running by a stopped watcher` and leaves `.run/running/1.pid` in place, the watcher reaps the lock into `.run/dead/1.1.md` with reason `crashed`, retries the task automatically and archives the change, and `osq land` exits 0 with the retried attempt's `src/one.txt`

#### Scenario: Halt that needs no steering
- **WHEN** a change halts with `worktree_dirty` because an untracked file sits in its worktree, and a human runs `osq approve <id>`, removes the file, runs `osq retry <id> change`, runs `osq watch --once`, and runs `osq land <id>`
- **THEN** `osq approve` exits 1 with next step `osq retry <id> change` and writes nothing, the retry exits 0, task 1 spawns, and `osq land` exits 0

### Requirement: Stopped watcher's lock at retry
`osq retry <id> <n>` for a task whose `.run/running/<n>.pid` records a `pid`
that `isPidRunning` reports as not running SHALL refuse, writing nothing,
with `Task <n> was left running by a stopped watcher (pid <pid>); run osq
watch to reap it, then osq retry <id> <n> if it stays dead.` A lock whose pid
runs, or whose pid cannot be read, SHALL still refuse with `Task <n> is
running; retry is refused.`

#### Scenario: Lock of a stopped watcher
- **WHEN** `.run/running/1.pid` records the pid of a process that has exited, and a human runs `osq retry <id> 1`
- **THEN** it exits 1 with `Task 1 was left running by a stopped watcher (pid <pid>)`, and `.run/running/1.pid` and every marker are unchanged
