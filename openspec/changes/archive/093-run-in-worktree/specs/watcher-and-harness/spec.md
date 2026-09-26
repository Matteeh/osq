## ADDED Requirements

### Requirement: Worktree run
<!-- source: src/watcher/loop.ts, src/watcher/worktree-run.ts, tests/worktree-run.test.ts -->
The watcher cycle SHALL run a change the resolver reports from a worktree
tree with that tree's root as the project root, so the reaper, automatic
retries, the scope audit, the runner, verify with `OSQ_CHANGE`, the adapters,
the mutation check, and the archiver all work inside the worktree. Before it
spawns a task and before it archives, it SHALL check the worktree: HEAD SHALL
be on `osq/<folder>`, and status SHALL list nothing outside the change
folder's `.run/` other than the change folder's `tasks.md`. When HEAD is on
another branch or detached, it SHALL halt the change with reason
`worktree_off_branch` and the branch as the detail. When status lists other
files, it SHALL halt the change with reason `worktree_dirty` and the files,
one per line, as the detail. Changes in the project root SHALL run as before.

#### Scenario: Task runs in the worktree
- **WHEN** a change approved into a worktree has a pending task and a watcher cycle runs from the checkout
- **THEN** the adapter's `projectRoot` is the worktree, the task's verify runs there with `OSQ_CHANGE` set to the worktree's change folder, and the checkout's files and its copy of the change are unchanged

#### Scenario: Dirty worktree
- **WHEN** a file outside the change folder is modified in the worktree before a cycle
- **THEN** no task spawns and `.run/regressed/change.md` has reason `worktree_dirty` and names the file

#### Scenario: Off its branch
- **WHEN** the worktree has checked out another branch
- **THEN** no task spawns and `.run/regressed/change.md` has reason `worktree_off_branch` and names the branch

#### Scenario: Records are not dirt
- **WHEN** the worktree has uncommitted files only under the change folder's `.run/` and a ticked `tasks.md`
- **THEN** the next task spawns

### Requirement: Worktree halt
<!-- source: src/watcher/worktree-run.ts, tests/worktree-run.test.ts -->
To halt a change in a worktree, the watcher SHALL write `.run/regressed/change.md`
with `reason: <reason>` in its frontmatter and the detail as its body, append
one `regressed` event with target `change`, that reason, and the detail as
`output`, and log one line naming the change and the reason. The change then
waits, as for any change-level regression, until a human runs
`osq retry <id> change`. A halt SHALL NOT be retried automatically.

#### Scenario: Human clears a halt
- **WHEN** a change halted with `worktree_dirty`, a human removes the file, and runs `osq retry <id> change`
- **THEN** the next cycle spawns the pending task

### Requirement: Verified task commit
<!-- source: src/core/run/task-commit.ts, src/watcher/worktree-run.ts, tests/worktree-run.test.ts -->
After a task in a worktree passes and its mutation check has run, the watcher
SHALL make one commit holding every path status lists that the task's `scope`
covers, a rename's source included, every untracked file under `tests/`, and
the change folder's `.run/done/<n>`, `.run/results/<n>.md`,
`.run/events/<n>.jsonl`, and `tasks.md`. Its subject SHALL be
`osq: <id> task <n> verified`, its message SHALL come from "Osq commit
message" with the task's title and outcome line, and its author SHALL be
`vcs.author`. The outcome line SHALL be `formatTaskOutcomeLine` with symbols
off and the whole seconds since the task's last `started` event, 0 without
one. Anything else status lists SHALL stay uncommitted, so the next check
halts on it by name. Each cycle, before picking a task for a change that is
not halted, the watcher SHALL make the same commit, in task order, for every
task whose `.run/done/<n>` status lists as untracked and whose marker is not
`manual: true`.

#### Scenario: Two tasks, two commits
- **WHEN** a two-task change in a worktree runs and each task edits one file in its scope
- **THEN** the branch gains `osq: <id> task 1 verified` and `osq: <id> task 2 verified`, each holding its task's file and records, and the worktree is clean outside `.run/` after each

#### Scenario: New test file outside scope
- **WHEN** a task creates `tests/new.test.ts` outside its scope and passes
- **THEN** the task's commit holds `tests/new.test.ts`

#### Scenario: Commit left undone
- **WHEN** a task's done marker is written and the watcher stops before its commit
- **THEN** the next cycle commits it as `osq: <id> task <n> verified` before spawning the next task

### Requirement: Archive commit
<!-- source: src/core/run/task-commit.ts, src/watcher/worktree-run.ts, tests/worktree-run.test.ts -->
After the archiver moves a change in a worktree into the archive, the watcher
SHALL make one commit holding the change folder's old path, the tree's archive
directory, and the living specs directory, with subject `osq: <id> archived`,
the proposal's title and `archived to <archivePath>` as its body lines, the
trailer `Osq-Change: <folder>`, and author `vcs.author`, built by
`formatCommitMessage`. After it the worktree SHALL be clean.

#### Scenario: Last task archives
- **WHEN** the last task of a change in a worktree passes
- **THEN** the branch's newest commit is `osq: <id> archived`, the change folder is under the worktree's archive directory with its deltas merged into the worktree's living specs, and `git status` in the worktree is empty

### Requirement: Commit failure
<!-- source: src/watcher/worktree-run.ts, tests/worktree-run.test.ts -->
A verified-task or dead-task commit that fails SHALL halt the change with
reason `commit_failed` and git's output as the detail. osq SHALL NOT try the
commit again on its own; after `osq retry <id> change`, the next cycle makes
the verified-task commit again under "Verified task commit". A failed archive
commit SHALL log git's output and leave the worktree as it is.

#### Scenario: Hook rejects the task commit
- **WHEN** the worktree's `pre-commit` hook exits 1 with `blocked by hook` after a task passes
- **THEN** `.run/regressed/change.md` has reason `commit_failed` and contains `blocked by hook`, and no later cycle commits or spawns until `osq retry <id> change`

#### Scenario: Retry after the hook is fixed
- **WHEN** the hook is fixed and a human runs `osq retry <id> change`
- **THEN** the next cycle commits the task as `osq: <id> task <n> verified` and then spawns the next task

### Requirement: Dead path in a worktree
<!-- source: src/watcher/loop.ts, src/watcher/worktree-run.ts, tests/worktree-run.test.ts -->
When a task in a worktree dies, because `runTask` returned a failure other
than `regressed` or `already_running`, or because the reaper recorded
`crashed` or `timeout` for its lock, the watcher SHALL record it through
"Dead task record" after the dead marker and event are written, with the
task's title and the outcome line `formatTaskOutcomeLine` writes with symbols
off, the reason, and the whole seconds since the task's last `started` event,
0 without one. Afterwards the branch tip SHALL be the last verified state plus
the dead record, and the worktree SHALL be clean outside the change folder.

#### Scenario: Verify fails
- **WHEN** a task in a worktree edits a file in its scope and its verify fails
- **THEN** the branch gains `osq: <id> task <n> dead, reason verify_red`, the file is back to its last committed state, and `.run/dead/<n>.patch` holds the edit

#### Scenario: Crash found after a restart
- **WHEN** a task's lock names a dead process and the worktree holds its edits when a cycle starts
- **THEN** the reaper's `crashed` death is committed with its patch, and the worktree is clean outside the change folder

### Requirement: Violations kill in a worktree
<!-- source: src/watcher/git-guard.ts, src/watcher/runner.ts, src/watcher/failure-reason.ts, tests/worktree-guard.test.ts -->
With `vcs.enabled`, when HEAD was on a branch starting with `osq/` before the
agent spawned, a `vcs_violation` or `scope_violation` that "Git state
recording" or "Scope violation recording" appends SHALL also kill the task
with that reason, before verify runs, even when verify would pass. The dead
marker's body SHALL be the logged warning for `vcs_violation` and the files,
one per line, for `scope_violation`. When both happen, the reason SHALL be
`vcs_violation`. A task whose spawn already failed SHALL keep that failure.

#### Scenario: Edit outside scope in a worktree
- **WHEN** an agent in an osq worktree edits a tracked file outside its scope and the task's verify would pass
- **THEN** `runTask` returns `scope_violation`, its dead marker names the file, and no `verify_ran` event follows the `scope_violation` event

#### Scenario: Agent commits in a worktree
- **WHEN** an agent in an osq worktree commits its edit
- **THEN** `runTask` returns `vcs_violation`

#### Scenario: Same edit in the checkout
- **WHEN** the same edit outside scope happens in a checkout on `main` with `vcs.enabled` off
- **THEN** a `scope_violation` event is recorded and the task is done

### Requirement: Lifecycle commands in a worktree
<!-- source: src/core/lifecycle/reject.ts, src/core/lifecycle/retry.ts, tests/worktree-lifecycle.test.ts -->
`retry`, `reject`, `done`, and `verified` SHALL act on the folder the change
locations module returns, so for a change that runs in a worktree they write
their markers in the worktree and never in the checkout. `rejectSpec` SHALL
read a change's markers in the change's own tree and move the change into that
tree's rejected directory. `retrySpec`'s recertification SHALL run the task's
verify and hash its scope in the change's own tree.

#### Scenario: Reject a dead change in a worktree
- **WHEN** a change in a worktree has a dead task and a human runs `osq reject <id> --reason stop`
- **THEN** the folder moves to the worktree's rejected directory, and the checkout's copy of the change and its rejected directory are unchanged

#### Scenario: Recertify in the worktree
- **WHEN** a done task in a worktree has a scope regression and its verify passes only in the worktree
- **THEN** `osq retry <id> <n>` recertifies it

#### Scenario: Manual done in the worktree
- **WHEN** a human runs `osq done <id> <n> --manual <reason>` for a change in a worktree
- **THEN** `.run/done/<n>` is written in the worktree's change folder and not in the checkout's copy

## MODIFIED Requirements

### Requirement: Git state recording
<!-- source: src/core/vcs/snapshot.ts, src/watcher/git-guard.ts, src/watcher/runner.ts, tests/vcs-guard.test.ts -->
When `GitVcs` is selected, the runner SHALL record HEAD's commit and branch,
the index digest, and the stash list before it spawns the agent, and again
after the agent exits and before verify. When any of them differs, the runner
SHALL append one `vcs_violation` event with `moved`, the list of what differs
from `head`, `branch`, `index` and `stash`, and `before` and `after` holding
all four values. It SHALL log a warning that names what moved, how to put each
back, and that a human using git in this checkout during the task causes the
same result. Outside an osq worktree the task's outcome SHALL NOT change;
inside one, "Violations kill in a worktree" applies. A git read that fails
SHALL record nothing and log a warning.

#### Scenario: Agent commits
- **WHEN** the agent commits its edit and the task's verify passes
- **THEN** a `vcs_violation` event lists `head` in `moved` with both commits, and the task is done

#### Scenario: Agent stashes
- **WHEN** the agent runs `git stash` on the checked-out branch
- **THEN** a `vcs_violation` event lists `stash` in `moved`, and HEAD is unchanged in `before` and `after`

#### Scenario: Agent checks out another branch
- **WHEN** the agent checks out another branch
- **THEN** a `vcs_violation` event lists `branch` in `moved`

#### Scenario: Agent stages a file
- **WHEN** the agent runs `git add` on a file in its scope
- **THEN** a `vcs_violation` event lists `index` in `moved`

#### Scenario: Outside git
- **WHEN** a task runs under `NoVcs`
- **THEN** no `vcs_violation` or `scope_violation` event is recorded

### Requirement: Scope violation recording
<!-- source: src/core/vcs/snapshot.ts, src/watcher/git-guard.ts, tests/vcs-guard.test.ts, tests/worktree-guard.test.ts -->
When `GitVcs` is selected, the runner SHALL hash every file status lists
before it spawns the agent, with null for a deleted file. After the agent exits
and before verify, a file SHALL count as changed during the task when status
lists it now or before spawn and its status code or hash differs. A changed
file SHALL be a scope violation when it is outside the task's scope resolved
after the agent exits, and outside the change folder. A file under `tests/`
that status lists as untracked after the agent exits and did not list before
spawn SHALL NOT be a scope violation, because new test files are always
allowed. The runner SHALL append one `scope_violation` event whose `files`
lists the violations sorted, and log a warning. Outside an osq worktree the
task's outcome SHALL NOT change; inside one, "Violations kill in a worktree"
applies. Under `NoVcs`, scope checks SHALL stay as they are.

#### Scenario: Edit outside scope
- **WHEN** the agent edits a tracked file outside its scope and the task's verify passes
- **THEN** a `scope_violation` event names that file, and the task is done

#### Scenario: Human edit before spawn
- **WHEN** a file outside scope was modified before spawn and the agent leaves it alone
- **THEN** no `scope_violation` event is recorded

#### Scenario: Agent edits a dirty file
- **WHEN** a file outside scope was modified before spawn and the agent edits it again
- **THEN** a `scope_violation` event names that file

#### Scenario: New test file
- **WHEN** the agent creates `tests/extra.test.ts` outside its scope
- **THEN** no `scope_violation` event is recorded

### Requirement: Automatic retry
<!-- source: src/watcher/auto-retry.ts, src/watcher/loop.ts, src/core/lifecycle/retry.ts, tests/auto-retry.test.ts, tests/verify-path-missing.test.ts, tests/worktree-run.test.ts -->
Each cycle, for every dead task in an approved change, the watcher SHALL retry
the task through `retrySpec` with `automatic: true` when its dead reason is
eligible, it is not stuck, and it has fewer automatic retries than
`gates.autoRetries` since the later of the manifest's `approvedAt` and its last
manual retry. Eligible reasons SHALL be `verify_red`, `change_verify_red`,
`undeclared_test_change`, `verify_path_missing`, `denied_dependency`,
`vcs_violation`, `scope_violation`, `no_result`, `crashed`, and `timeout`.

#### Scenario: Retry fixes the task
- **WHEN** a task dies with `verify_red` and passes on its next attempt
- **THEN** it reaches done with exactly one `retry` event carrying `automatic: true`, and the watcher printed one automatic-retry line

#### Scenario: Missing verify path is retried
- **WHEN** a task dies with `verify_path_missing`
- **THEN** it is retried automatically once and the next attempt's prompt contains the missing path

#### Scenario: Denied dependency is retried
- **WHEN** a task dies with `denied_dependency` for `vue`
- **THEN** it is retried automatically once and the next attempt's prompt contains `vue`

#### Scenario: Ineligible reason
- **WHEN** a task dies with `spec_conflict`, `already_running`, or `verify_precondition`
- **THEN** it stays dead and no automatic `retry` event is appended

#### Scenario: Count exhausted
- **WHEN** a task that already had one automatic retry dies again with a new fingerprint and the count is 1
- **THEN** it stays dead until a human runs `osq retry`, after which it may be retried automatically once more

#### Scenario: Disabled
- **WHEN** `gates.autoRetries` is 0
- **THEN** no automatic retry happens, no task is marked stuck, and dead tasks behave as before

#### Scenario: Restart between death and retry
- **WHEN** the watcher stops after a death is recorded and before the retry, then starts again
- **THEN** the task is retried exactly once and runs once more

#### Scenario: Once mode
- **WHEN** `osq watch --once` performs an automatic retry
- **THEN** it continues and runs the retried task before exiting

#### Scenario: Scope violation is retried
- **WHEN** a task in a worktree dies with `scope_violation`
- **THEN** it is retried automatically once and the next attempt's prompt contains the violating file

## REMOVED Requirements

### Requirement: Worktree changes wait
**Reason**: The watcher now runs a change inside its worktree.
**Migration**: See "Worktree run".
