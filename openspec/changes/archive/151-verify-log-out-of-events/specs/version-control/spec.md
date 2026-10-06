## MODIFIED Requirements

### Requirement: Default branch sync
`syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` SHALL take the default
branch into a change's branch, in the change's worktree, for a change that is
active or archived there, and report whether it merged. It SHALL take an
optional progress callback and an optional `skipVerify` flag. When the default
branch's tip is already an ancestor of the worktree's HEAD, it SHALL write
nothing, call no callback, and report no merge. Otherwise it SHALL work in this
order. Every stop SHALL throw a `SyncStop`, an `Error` from
`src/core/vcs/sync-stop.ts` whose `reason` is `requirement_changed` for the
stop of step 1, `sync_conflict` for the conflict stop of step 2,
`sync_verify_red` for a red verify or check in step 5, and `sync_failed` for
every other stop. Every stop SHALL leave the worktree's HEAD where it was, and every
tracked file outside the change folder's `.run/` as it was. Before it first
writes the change folder's `.run/events/change.jsonl`, it SHALL keep that
file's contents, or note that it is absent. After any abort, it SHALL write
those contents back, or remove the file when it was absent. Lines that were
not committed before the sync then survive a stop:

1. Before writing anything, for every capability with a delta in the change
   folder, it SHALL compare every requirement the delta names under
   `## MODIFIED Requirements` or `## REMOVED Requirements`, or as a
   `## RENAMED Requirements` source, between the living spec at the
   requirements base and the living spec at the default branch's tip. The
   requirements base is the commit in `.run/requirements-base`, which approval
   after a default-branch trigger writes, or the commit in `.run/base` when
   that marker is absent or blank. It compares the requirement's full text as
   `parseCapabilitySpec` returns it. When any of them differs or is missing on
   the default branch, it SHALL stop with `<folder>: <default branch> changed
   requirements this change rewrites since it was approved: <capability>:
   <requirement>, ...; run osq plan <id> to revise the plan against <default
   branch>`.
2. It SHALL call the progress callback once with `<default branch> has <n> new
   commits; merging into osq/<folder>` and a verify suffix, where `<n>` is
   `countCommits` from the worktree's HEAD to the default branch, and
   `commits` reads `commit` when `<n>` is 1. For an archived change the suffix
   is ` and running verify: <command>`, left out when the proposal has no
   `verify`. For an active change it is ` and re-running verify for tasks
   <n>, ...`, naming the tasks step 5 runs, left out when there are none. With
   `skipVerify` set the suffix is left out. It SHALL then merge the default
   branch without committing. A conflict at a
   path under the living specs directory or under the archive directory is
   resolved in step 3. A conflict at any other path SHALL abort the merge and
   stop with `<folder>: <paths, comma-separated> conflict with <default
   branch>; run osq plan <id>, and approving the revised plan restarts
   osq/<folder> from <default branch>`, for an active or an archived change.
3. For every conflicting path under the archive directory, it SHALL put the
   default branch's copy in place, or remove the file when the default branch
   has none. For every capability folder under the living specs directory of
   the merged worktree, it SHALL put the default branch's copy of its
   `spec.md` in place, or remove the file when the default branch has none.
   For an archived change it SHALL then apply the archived folder's deltas
   with `applyOpenSpecDeltas`, the function archive uses. An active change
   keeps the default branch's copies, because archive has not applied its
   deltas yet. It SHALL stage every file this step wrote or removed. A delta
   that no longer applies SHALL abort the merge and stop with the merge
   error's message.
4. It SHALL run `vcs.prepare` in the worktree when it is set, as approval
   does. A failure SHALL abort the merge and stop with its output.
5. For an archived change, it SHALL run the proposal's `verify` in the
   worktree through `runVerificationCommand`, with no `OSQ_CHANGE`, bounded by
   `timeouts.verifyTimeoutSeconds`. A failure SHALL abort the merge and stop
   with `<folder>: verify failed on osq/<folder> merged with <default branch>:`
   and the last `limits.cardOutputLines` lines of its output. It SHALL then run
   the proposal's `check` command, when `readCheckCommand` finds one, the same
   way, and a failure SHALL abort the merge and stop with `<folder>: check
   failed on osq/<folder> merged with <default branch>:` and the same tail.
   The check SHALL run after the verify and before the `synced` event. For an active
   change, it SHALL instead run, in task order, the `verify` of every task
   whose `.run/done/<n>` marker exists and does not carry `manual: true`,
   through `runVerificationCommand` with `OSQ_CHANGE` set to the change folder
   and the same bound. A failure SHALL abort the merge and stop with
   `<folder>: verify of task <n> failed on osq/<folder> merged with <default
   branch>:` and the same tail. With `skipVerify` set it SHALL run no command.
   For each passing command, it SHALL write the command's log and append to
   the change folder's `.run/events/change.jsonl` a `verify_ran` event whose
   data holds `command`, `exitCode`, `duration` in milliseconds, `log`, the
   output's tail as `output` when that tail is not blank, and `task` for a
   task's `verify`, as watcher-and-harness's "Verify output logs" says. It
   SHALL then append a `synced` event
   whose data holds `defaultBranch`, `commits` (the `<n>` of step 2), and
   `duration`, the milliseconds from the merge's start to this step's end, and
   stage that file. With no command to run, only the `synced` event is
   appended. The log files are ignored by git, and no commit holds them.
6. It SHALL commit the merge with no paths, so the commit holds the staged
   events, authored by `vcs.author`, with the message `osq: <id> sync <default
   branch>`, a blank line, and `Osq-Change: <folder>`. A failed commit SHALL
   abort the merge and stop with git's output.

#### Scenario: Already current
- **WHEN** the default branch has not moved since the branch was cut
- **THEN** the sync reports no merge and the branch tip is unchanged

#### Scenario: Both add to one capability
- **WHEN** changes `001` and `002` were cut from the same default branch, both add a requirement to capability `orders`, `001` has landed, and `002`'s branch holds `002`'s archive
- **THEN** the sync commits `osq: 002 sync main`, and `orders`'s living spec on the branch equals `applyOpenSpecDeltas` of `002`'s delta over the default branch's copy, holding both requirements with no conflict marker

#### Scenario: Requirement changed on the default branch
- **WHEN** `002` modifies requirement `Order totals`, and a change that landed after `002` was approved also modified it
- **THEN** the sync throws a `SyncStop` with reason `requirement_changed` naming `orders: Order totals` and ending `run osq plan 002 to revise the plan against main`, and the worktree's HEAD and status are unchanged

#### Scenario: Requirements base after a revised approval
- **WHEN** `002` modifies requirement `Order totals`, the default branch changed it at commit `C`, `002`'s `.run/requirements-base` holds `C`, and the default branch then gains an unrelated commit
- **THEN** the sync commits `osq: 002 sync main` without stopping

#### Scenario: Code conflict
- **WHEN** the default branch and `002` both changed the same line of `src/app.txt`
- **THEN** the sync stops naming `src/app.txt`, and the worktree's HEAD and status are unchanged

#### Scenario: Red verify after the merge
- **WHEN** the merged tree makes the proposal's `verify` exit 1 after printing `broken`
- **THEN** the sync throws a `SyncStop` with reason `sync_verify_red`, with the verify line and output holding `broken`, and the worktree's HEAD and status are unchanged

#### Scenario: Sync announces itself
- **WHEN** the default branch has one commit the branch lacks and `osq land <id>` runs
- **THEN** stderr holds `main has 1 new commit; merging into osq/<folder> and running verify: node verify.cjs` before the land's output

#### Scenario: Sync records its verify
- **WHEN** the sync merges and its `verify` passes
- **THEN** the sync commit's `.run/events/change.jsonl` in the archived folder ends with a `verify_ran` event holding the command, exit code 0, a duration and a `log`, then a `synced` event holding `main`, the commit count, and a duration

#### Scenario: Active change before its first task
- **WHEN** `002` is active in its worktree with a delta for `orders` and no done task, and the default branch has one commit that changes `orders`'s living spec and adds `src/other.txt`
- **THEN** the sync commits `osq: 002 sync main`, `orders`'s living spec on the branch equals the default branch's copy without `002`'s delta, `src/other.txt` is in the worktree, the progress line has no verify suffix, and `.run/events/change.jsonl` ends with a `synced` event and holds no `verify_ran`

#### Scenario: Active change re-runs done tasks
- **WHEN** `002` is active with task 1 done, task 2 pending, and task 3 done by hand with `manual: true`, and the default branch has moved
- **THEN** the progress line ends ` and re-running verify for tasks 1`, and the sync commit's `.run/events/change.jsonl` ends with a `verify_ran` event holding `task` `1` and exit code 0, then a `synced` event

#### Scenario: Red task verify after the merge
- **WHEN** `002` is active with task 1 done, and the merged tree makes task 1's `verify` exit 1
- **THEN** the sync throws a `SyncStop` with reason `sync_verify_red` whose message starts `002-<words>: verify of task 1 failed`, and the worktree's HEAD is unchanged

#### Scenario: Verify skipped on request
- **WHEN** `002` is active with task 1 done, the merged tree makes task 1's `verify` exit 1, and the sync runs with `skipVerify`
- **THEN** the sync commits `osq: 002 sync main`, the progress line has no verify suffix, and `.run/events/change.jsonl` ends with a `synced` event and holds no new `verify_ran`

#### Scenario: Code conflict in an active change
- **WHEN** `002` is active and the default branch and `002` both changed the same line of `src/app.txt`
- **THEN** the sync throws a `SyncStop` with reason `sync_conflict` whose message names `src/app.txt` and ends `run osq plan 002, and approving the revised plan restarts osq/002-<words> from main`, and the worktree's HEAD is unchanged

#### Scenario: Failed commit keeps uncommitted events
- **WHEN** `002` is active, its `.run/events/change.jsonl` has a line that is not committed, the default branch has moved, and a `pre-commit` hook exits 1
- **THEN** the sync throws a `SyncStop` with reason `sync_failed`, the worktree's HEAD is unchanged, and `.run/events/change.jsonl` holds exactly what it held before the sync, that line included

#### Scenario: Stacked dependent after its dependency landed
- **WHEN** `002` was cut from `001`'s archive commit and is active, the default branch then moved, and `001` landed through `osq land`, whose sync appended to `001`'s archived `.run/events/change.jsonl`
- **THEN** the sync of `002` commits `osq: 002 sync main`, `001`'s archive folder on `002`'s branch equals the default branch's copy, and no file on the branch holds a conflict marker

#### Scenario: Red check after the merge
- **WHEN** an archived change's proposal has `check: node check.cjs`, its `verify` passes on the merged tree, and `node check.cjs` exits 1 after printing `smoke failed`
- **THEN** the sync throws a `SyncStop` with reason `sync_verify_red` whose message holds `check failed on osq/<folder>` and `smoke failed`, and the worktree's HEAD and status are unchanged

#### Scenario: Sync records its check
- **WHEN** an archived change's proposal has `check: node check.cjs`, the sync merges, and both its `verify` and its check pass
- **THEN** the sync commit's `.run/events/change.jsonl` ends with a `verify_ran` event for the verify, a `verify_ran` event whose command is `node check.cjs`, then a `synced` event
