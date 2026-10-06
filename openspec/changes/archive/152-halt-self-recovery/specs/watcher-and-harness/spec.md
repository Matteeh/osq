## ADDED Requirements

### Requirement: Commit failure catch-up
A verified-task or dead-task commit that fails SHALL halt the change with
reason `commit_failed` and git's output as the detail. Each cycle, for a
change in a git worktree, after the reaper and before the automatic-retry
step, the watcher SHALL catch up on its records through
`catchUpWorktreeCommits` in `src/watcher/commit-catch-up.ts`:

1. When `.run/regressed/change.md` exists with a reason other than
   `commit_failed`, it SHALL do nothing.
2. When it exists with reason `commit_failed`, it SHALL count the `regressed`
   events with reason `commit_failed` in `.run/events/change.jsonl` after the
   last `retry` event for target `change` that has no `automatic` key. When
   that count is more than `gates.commitRetries`, it SHALL do nothing more
   and the change stays halted.
3. It SHALL commit, in task order, every task whose `.run/dead/<n>.md` status
   lists as untracked or added, through "Dead task record" with the reason in
   that marker's frontmatter.
4. After a `commit_failed` halt and successful dead commits, it SHALL clear
   the halt through `retrySpec` with target `change` and `{ automatic: true }`,
   and log `↻ change of <id> caught up after commit_failed`.

A failed dead commit in step 3 SHALL halt again with `commit_failed`. After
the halt clears, the cycle goes on as for a change that never halted, so
"Verified task commit" makes any pending verified commit, and a failure there
halts again with `commit_failed`. A human `osq retry <id> change` grants a new
budget.

#### Scenario: Dead commit caught up
- **WHEN** a task in a worktree dies with `verify_red`, its dead commit fails on a `pre-commit` hook that prints `blocked by hook`, the hook is removed, and a watcher cycle runs
- **THEN** the branch gains `osq: <id> task <n> dead, reason verify_red`, the worktree is clean outside the change folder, `.run/regressed/change.md` is gone and `.run/regressed/change.1.md` holds `blocked by hook`, and `.run/events/change.jsonl` ends with a `retry` event whose target is `change`, reason `commit_failed`, and `automatic` true

#### Scenario: Verified commit caught up
- **WHEN** the `pre-commit` hook rejects a passing task's commit, the hook is removed, and a watcher cycle runs with no `osq retry`
- **THEN** the cycle commits `osq: <id> task <n> verified` and spawns the next task

#### Scenario: Record left undone
- **WHEN** a task's `.run/dead/<n>.md` exists, untracked, with the agent's edits still in the worktree and no halt, and a watcher cycle runs
- **THEN** the cycle commits the dead record before the automatic-retry step, and no `worktree_dirty` halt is written

#### Scenario: Budget spent
- **WHEN** the `pre-commit` hook keeps rejecting, `gates.commitRetries` is 2, and five watcher cycles run after the first `commit_failed` halt
- **THEN** `.run/events/change.jsonl` holds exactly three `regressed` events with reason `commit_failed` and the branch tip is unchanged

#### Scenario: Retry after the hook is fixed
- **WHEN** the budget is spent, the hook is fixed, and a human runs `osq retry <id> change`
- **THEN** the next cycle commits the task as `osq: <id> task <n> verified` and then spawns the next task

#### Scenario: Other halts left alone
- **WHEN** `.run/regressed/change.md` has reason `worktree_dirty`
- **THEN** the catch-up commits nothing and writes no event

## MODIFIED Requirements

### Requirement: Dead task record
Given a `Vcs` for an osq worktree, a change folder inside it, a task number, a
reason, the task title, and the outcome line, the dead record SHALL, in this
order: remove an existing `.run/dead/<n>.patch`; write `patch()` to
`.run/dead/<n>.patch`; discard every path `status` reports outside the change
folder, a rename's source included; then commit whichever of
`.run/dead/<n>.md`, `.run/dead/<n>.patch`, and `.run/events/<n>.jsonl` exist,
with subject `osq: <id> task <n> dead, reason <reason>`, the message from
"Osq commit message", and author `vcs.author`. It SHALL return the new
commit. It SHALL never discard or commit anything else inside the change
folder, so for `spec_conflict` the human's edits to the folder stay
uncommitted. When `vcs.author` is unset it SHALL fail before writing
anything.

#### Scenario: Agent edits put back
- **WHEN** a task dies with reason `verify_red` after the agent modified a tracked file and created `src/new.ts` in the worktree
- **THEN** the branch gains one commit holding only the three `.run/` files, the worktree status is empty outside `.run/`, and `git apply` of the committed patch on the worktree restores both edits

#### Scenario: Patch before discard
- **WHEN** discarding fails
- **THEN** `.run/dead/<n>.patch` already holds the agent's edits

#### Scenario: Spec conflict
- **WHEN** a task dies with reason `spec_conflict` after `tasks/1.md` in the worktree's change folder was edited
- **THEN** the dead commit holds only `.run/` files, and the edit to `tasks/1.md` remains, uncommitted

#### Scenario: Patch from an earlier try
- **WHEN** `.run/dead/<n>.patch` already holds `stale` from a failed try and the dead record runs again
- **THEN** the committed patch holds the agent's edits and does not contain `stale`

## REMOVED Requirements

### Requirement: Commit failure
**Reason**: osq now commits a failed record again by itself; "Commit failure catch-up" replaces this requirement and keeps its two scenarios.
**Migration**: None. A human `osq retry <id> change` still works and grants a new catch-up budget.
