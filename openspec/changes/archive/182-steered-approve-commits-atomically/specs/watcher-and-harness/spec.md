## ADDED Requirements

### Requirement: Retry refuses uncommitted plan edits
`assertPlanCommitted(projectRoot, specId, config)` in
`src/core/lifecycle/retry-plan-edits.ts` SHALL find the change as `retrySpec`
does and, when the change sits in an osq worktree and `GitVcs` is selected
there, read the worktree's status. When status lists any path inside the
change folder other than its `tasks.md` and anything under its `.run/`, it
SHALL fail with
`Change <id> has plan edits not committed in its worktree: <paths>. Run osq approve <id> to approve them.`
where `<paths>` are those paths relative to the change folder, sorted and
joined with `, `. Otherwise, and for a change not in a worktree or with
`NoVcs`, it SHALL return without effect. It SHALL write nothing.

`retryCommand` SHALL call it before `retrySpec`, so `osq retry`, the inbox
retry key, the dashboard and the server refuse such a retry and write
nothing. The watcher's automatic retries and the trigger retirement in
"Approval after steering" call `retrySpec` directly and SHALL stay as they
are.

#### Scenario: Plan edits not committed
- **WHEN** a change in a worktree has a dead task 1, and the worktree holds the edits in the row, and a human runs `osq retry <id> 1`
- **THEN** the retry does what the row says:

| worktree edits | `osq retry <id> 1` |
| --- | --- |
| `tasks/1.md` and `proposal.md` changed | exits 1 with `Change <id> has plan edits not committed in its worktree: proposal.md, tasks/1.md. Run osq approve <id> to approve them.`, and `.run/dead/1.md` is still in place |
| new untracked `tasks/2.md` | exits 1 naming `tasks/2.md` |
| `tasks.md` with task 1's checkbox ticked | exits 0 and `.run/dead/1.md` is now `.run/dead/1.1.md` |
| none | exits 0 and `.run/dead/1.md` is now `.run/dead/1.1.md` |

## MODIFIED Requirements

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

#### Scenario: Approval commit failed
- **WHEN** with `gates.autoRetries` of 1 task 1 sticks, a planner edits `tasks/1.md` in the worktree, the worktree's `index.lock` exists while a human runs `osq approve <id>`, the human then runs `osq retry <id> 1`, the lock goes away as when another git process ends, and the human runs `osq approve <id>`, `osq watch --once` and `osq land <id>`
- **THEN** the first `osq approve` exits 1 with `run osq approve <id> again`, `osq retry` exits 1 naming `tasks/1.md`, the second `osq approve` prints `Continues from task 1`, the executor spawned a third time, and `osq land` exits 0 with the third attempt's `src/one.txt`
