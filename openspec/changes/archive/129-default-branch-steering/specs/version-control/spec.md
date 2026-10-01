## ADDED Requirements

### Requirement: Land records a steering stop
When the sync that `landChange` runs stops with reason `sync_conflict`,
`requirement_changed`, or `sync_verify_red`, `landChange` SHALL record the
stop on the change's branch through `recordLandStop` in
`src/core/vcs/land-stop.ts`, then stop with the sync's message. Recording
SHALL write, in the archived folder in the change's worktree,
`.run/regressed/change.md` with frontmatter `reason: <stop reason>` and the
stop's message as its body, append to its `.run/events/change.jsonl` a
`regressed` event whose data holds `task` `change`, `reason`, and `output`
(the message), as "Worktree halt" writes them, and commit both files on
`osq/<folder>` with the message `osq: <id> land stopped`, authored by
`vcs.author`. When that commit fails, it SHALL put both files back as they
were and stop with the sync's message, a newline, and `osq could not record
the stop: <git output>`. A stop with reason `sync_failed`, and every refusal,
SHALL record nothing. Recording SHALL write nothing to the checkout or the
default branch, and SHALL leave the worktree's status empty.

#### Scenario: Conflict at land is recorded
- **WHEN** an archived change and the default branch both changed the same line of `src/one.txt`, and `osq land <id>` runs
- **THEN** `osq land` exits one with the sync's message, the branch tip is `osq: <id> land stopped`, the archived folder's `.run/regressed/change.md` has reason `sync_conflict` and names `src/one.txt`, the worktree's status is empty, and the checkout's HEAD and status are what they were

#### Scenario: Red verify at land is recorded
- **WHEN** the default branch moved and the merged tree makes the archived change's `verify` exit 1
- **THEN** the archived folder's `.run/regressed/change.md` has reason `sync_verify_red`, and the change's derived state has a `regression` trigger with target `change`

#### Scenario: Other stops record nothing
- **WHEN** the sync at land stops with reason `sync_failed` because `vcs.prepare` exits 1
- **THEN** `osq land` exits one with the sync's message and the branch tip is unchanged

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
   For each passing command, it SHALL append to
   the change folder's `.run/events/change.jsonl` a `verify_ran` event whose
   data holds `command`, `exitCode`, `duration` in milliseconds, `output` when
   the output is not blank, and `task` for a task's `verify`, as the
   watcher's verify gate writes it. It SHALL then append a `synced` event
   whose data holds `defaultBranch`, `commits` (the `<n>` of step 2), and
   `duration`, the milliseconds from the merge's start to this step's end, and
   stage that file. With no command to run, only the `synced` event is
   appended.
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
- **THEN** the sync commit's `.run/events/change.jsonl` in the archived folder ends with a `verify_ran` event holding the command, exit code 0, and a duration, then a `synced` event holding `main`, the commit count, and a duration

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

### Requirement: Land refusals
`landChange` in `src/core/vcs/land.ts` SHALL refuse, writing nothing, in this
order:

- With `vcs.enabled` off or `NoVcs` selected: `osq land needs vcs.enabled and
  git`.
- Every refusal of "Squash commit message" for the id, with its message,
  unless the change has already landed, as "Land cleanup" says.
- When the checkout's HEAD is not on the default branch: `osq land runs on
  <default branch>; the checkout is on <branch>`, or `on a detached HEAD`.
- When the worktree's `status` lists any entry: `<worktree> has uncommitted
  changes: <paths>; commit or discard them first`.
- When the change has not landed and its derived state has `steering`, as the
  status-inspection requirement "Steering triggers" defines it: `<folder>
  needs steering: <describeTrigger of its first trigger>; run osq plan <id>`.
- When another change that archived in an osq worktree and has not landed has
  an earlier `archived` event than this change, as `readLandedAt` reads it,
  and writes a delta for a capability this change also writes: `<other folder>
  archived before <folder> and also writes <capabilities>; land it first, or
  reject it`. A change with no `archived` event SHALL not be compared.

Uncommitted changes in the checkout SHALL NOT refuse a land. "Land from the
verified tree" stops only for those in files the land writes.

#### Scenario: Modified tracked file
- **WHEN** the checkout has a modified tracked file `README.md` that the change does not touch, and an untracked draft folder
- **THEN** `osq land` lands the change, and `README.md` keeps its edit

#### Scenario: Untracked draft only
- **WHEN** the checkout's only change is an untracked draft folder of another change
- **THEN** `osq land` lands the change

#### Scenario: Off the default branch
- **WHEN** the checkout is on branch `feature`
- **THEN** `osq land` refuses with `osq land runs on main; the checkout is on feature`

#### Scenario: Edited worktree
- **WHEN** the change's worktree has an untracked file `notes.txt`
- **THEN** `osq land` refuses naming `notes.txt`, and writes nothing

#### Scenario: Recorded stop refuses the next land
- **WHEN** an earlier `osq land <id>` recorded a `sync_conflict` stop on the change's branch, and `osq land <id>` runs again
- **THEN** it refuses with `<folder> needs steering: change conflict (sync_conflict); run osq plan <id>`, and the branch tip is unchanged

#### Scenario: Earlier change shares a capability
- **WHEN** `001` and `002` both archived and neither has landed, `001` archived first, both write `orders`, and `osq land 002` runs
- **THEN** it refuses with `001-<words> archived before 002-<words> and also writes orders; land it first, or reject it`

#### Scenario: Earlier change on other capabilities
- **WHEN** `001` archived first and writes only `billing`, and `002` writes only `orders`
- **THEN** `osq land 002` lands `002`

### Requirement: Land from the verified tree
After the refusals, `landChange` SHALL run `syncWithDefaultBranch` for the
change, passing on its progress callback, and stop with the sync's message
when it stops, after recording the stop as "Land records a steering stop"
says. It SHALL run no other `verify`: when the sync reports no merge,
the branch tip is the tree archive verified. It SHALL then take the worktree's
HEAD as the tip and the checkout's HEAD as the base, and stop with `<default
branch> moved while landing; run osq land <id> again` when the base is not an
ancestor of the tip. It SHALL build the land commit with `commitTree(tip,
base, message, vcs.author)`, where the message is what "Squash commit
message" builds at that moment, and move the checkout to it only through
`fastForward`. When `fastForward` returns `blocked`, it SHALL stop with `The
checkout has uncommitted changes in files this land writes: <paths>; commit or
stash them, then run osq land <id> again`. When `fastForward` fails and the
checkout's HEAD is no longer the base, it SHALL stop with the moved message,
and on any other failure with git's output. Every refusal and stop SHALL leave
the default branch, the checkout's index, and its tree as they were. On
success it SHALL print `Landed <folder> as <commit>`, clean up as "Land
cleanup" says, print `Kept branch osq/<folder>`, and exit zero. It SHALL never
push.

#### Scenario: Land after archive
- **WHEN** a change approved into a worktree has archived and the default branch has not moved
- **THEN** `osq land <id>` makes one commit on the default branch whose only parent is the old tip, whose tree equals the branch tip, whose message equals what `osq message <id>` printed before, whose `Osq-Head` is the branch tip, and whose author is `vcs.author`; the worktree is gone, the checkout holds the change only under the archive directory, and `osq/<folder>` still exists

#### Scenario: Two changes land in order
- **WHEN** `001` and `002` were cut from the same default branch and both add a requirement to `orders`, and `osq land 001` then `osq land 002` run
- **THEN** both succeed, `orders`'s living spec equals applying `001`'s delta and then `002`'s to the original spec, `osq/002-<words>` holds `osq: 002 sync main`, and the second commit's `Osq-Head` is that sync commit

#### Scenario: Stop leaves the checkout alone
- **WHEN** the sync stops on a code conflict
- **THEN** `osq land` exits one with the sync's message, and the checkout's HEAD and status are what they were

#### Scenario: Unrelated uncommitted work stays
- **WHEN** the checkout has a modified tracked `README.md`, a staged `notes.txt`, and an untracked draft folder of another change, none of which the change touches
- **THEN** `osq land` lands the change, `README.md` is still modified, `notes.txt` is still staged, and the draft folder remains

#### Scenario: Uncommitted file the change writes
- **WHEN** the checkout has a modified tracked file that the change also changes
- **THEN** `osq land` exits one with the uncommitted-files stop naming that file, the default branch has not moved, and the file keeps its edit

#### Scenario: Default branch moves during the land
- **WHEN** a commit lands on the default branch while the sync runs
- **THEN** `osq land` exits one with `main moved while landing; run osq land <id> again`, and the default branch is at that commit with no land commit on it

#### Scenario: Land commit runs no hook
- **WHEN** the repository's `pre-commit` hook exits 1 with `blocked by hook`
- **THEN** `osq land` lands the change, and its output does not hold `blocked by hook`

#### Scenario: No verify without a merge
- **WHEN** the default branch has not moved since archive and the proposal's `verify` would now exit 1
- **THEN** `osq land` lands the change without running it
