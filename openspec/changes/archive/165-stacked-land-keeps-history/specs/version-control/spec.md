## ADDED Requirements

### Requirement: Vcs history reads
The `Vcs` port SHALL also offer `mergeBase` and `trailerValues`, reads bounded
by `timeouts.gitSeconds` like every read. `mergeBase(a, b)` SHALL return the
commit `git merge-base <a> <b>` prints, and null, not fail, when the two share
no commit or either ref does not exist. `trailerValues(from, to, key)` SHALL
return the value of every `key` trailer, as `git log` parses trailers, on every
commit that `to` has and `from` lacks, newest commit first, trimmed, leaving
out commits without that trailer, and an empty list when either ref does not
exist. Under `NoVcs`, `mergeBase` SHALL return null and `trailerValues` an
empty list.

#### Scenario: Merge base of two branches
- **WHEN** `side` was cut from `main` at commit `B` and both have one more commit
- **THEN** `mergeBase('main', 'side')` is `B`, and `mergeBase('main', 'missing')` is null

#### Scenario: Trailer values in a range
- **WHEN** `main` gains commit `X` with trailer `Osq-Head: h1`, then commit `Y` with no trailer, then commit `Z` with trailer `Osq-Head: h2`, after commit `B`
- **THEN** `trailerValues('B', 'main', 'Osq-Head')` is `['h2', 'h1']`, `trailerValues('main', 'main', 'Osq-Head')` is empty, and `trailerValues('missing', 'main', 'Osq-Head')` is empty

#### Scenario: History reads without git
- **WHEN** `NoVcs` is asked for `mergeBase('main', 'side')` and `trailerValues('main', 'side', 'Osq-Head')`
- **THEN** it returns null and an empty list

### Requirement: Sync takes landed branch tips
Step 2 of "Default branch sync" SHALL merge the default branch itself unless a
land commit on the default branch carries a branch tip that shares history
with the change's branch. It SHALL read `trailerValues(<worktree HEAD>,
<default branch>, 'Osq-Head')` and keep each tip, once, whose `mergeBase` with
the worktree's HEAD exists and is not an ancestor of the default branch. With
no tip kept, it SHALL merge the default branch. Otherwise it SHALL build a
bridge commit with `commitTree(<default branch>, <default branch>, message,
vcs.author, <kept tips>)`, whose message is `osq: <id> bridge <default
branch>`, a blank line, and `Osq-Change: <folder>`, and merge that commit in
place of the default branch. Because the bridge holds the default branch's
tree and descends from the landed tip, git takes that tip, not the old default
branch, as the merge base, so lines only the landed change and this change
changed do not conflict. The bridge SHALL be written only as a parent of the sync
commit on the change's branch: no ref names it, the default branch never holds
it, and a sync that stops leaves it unreferenced. A tip that is not in the
repository has no merge base and is not kept.

#### Scenario: Three-change stack lands in order
- **WHEN** `001` changes line 1 of `src/one.txt`, `002` is stacked on `001` and changes the same line again, `003` is stacked on `002` and changes it once more, all three archived, and `osq land 001`, `osq land 002` and `osq land 003` run in that order
- **THEN** each land exits zero, `src/one.txt` on the default branch holds `003`'s line, and the default branch gained exactly three commits, each with one parent

#### Scenario: Stacked sync merges a bridge
- **WHEN** `002` is stacked on `001`, `001` has landed, and the sync of `002` runs
- **THEN** the sync commit's second parent is a commit whose subject is `osq: 002 bridge main`, whose tree equals the default branch's tip tree, and whose parents are the default branch's tip and `001`'s landed tip, and no ref other than `osq/002-<words>` reaches it

#### Scenario: Unrelated change merges the default branch
- **WHEN** `002` was cut from the default branch, not stacked, and `001`, cut from the same commit, has landed
- **THEN** the sync of `002` commits `osq: 002 sync main` whose second parent is the default branch's tip

#### Scenario: Landed tip missing from the repository
- **WHEN** the default branch's last commit carries `Osq-Head` naming a commit this repository does not have
- **THEN** the sync merges the default branch itself

## MODIFIED Requirements

### Requirement: Vcs land operations
The `Vcs` port SHALL also offer `commitTree`, `fastForward`, and
`countCommits`. `commitTree(source, parent, message, author, extraParents)`
SHALL write a commit whose tree is the tree of commit `source`, whose first
parent is `parent`, followed by each commit of the optional `extraParents` in
order, so that `parent` is its only parent when `extraParents` is absent or
empty, whose message is `message`, passed to git in a file and never as an
argument, and whose author is `author`, with git's configured identity as
committer, and return the new commit. It SHALL change no working tree, no
index, and no ref, and run no hook. When `git config --type=bool --get
commit.gpgSign` prints `true`, it SHALL pass `-S`, because `git commit-tree`
ignores that setting. `fastForward(commit)` SHALL first collect every `status`
entry whose path, or whose old path for a rename or copy, `commit` changes
relative to HEAD. When there is any, it SHALL return `blocked` with those
paths, relative to the project root and sorted, and run no write. Otherwise it
SHALL run `git merge --ff-only <commit>` and return `done` with an empty
`blocked` list and `changed` holding every path `commit` changes relative to
the old HEAD, relative to the project root and sorted. A `blocked` result
SHALL carry no `changed` field. When git refuses it SHALL fail with git's
output, leaving HEAD, the index, and the tree as they were. `commitTree` and
`fastForward` SHALL be bounded by `timeouts.gitCommitSeconds`.
`countCommits(from, to)` SHALL return how many commits `to` has that `from`
lacks, and 0 when either ref does not exist. Under `NoVcs`, `countCommits`
SHALL return 0, and `commitTree` and `fastForward` SHALL fail naming the
reason git is off.

#### Scenario: Commit from a branch's tree
- **WHEN** branch `side` was cut from `main` and has two more commits, the checkout on `main` has a modified tracked file and a staged file, and `commitTree('side', 'main', message, 'osq <osq@example.invalid>')` runs
- **THEN** the new commit's tree equals `side`'s tip tree, its only parent is `main`'s tip, its author is `osq <osq@example.invalid>`, its message is `message`, and HEAD, `main`, `indexDigest`, and `status` are unchanged

#### Scenario: Commit tree runs no hook
- **WHEN** the repository's `pre-commit` hook exits 1 and `commitTree` runs
- **THEN** it returns a commit

#### Scenario: Commit tree signs when git is set to
- **WHEN** `commit.gpgSign` is true and `gpg.program` names a script that records its call and prints a signature
- **THEN** `commitTree`'s commit carries a `gpgsig` header and the script ran

#### Scenario: Fast-forward past unrelated work
- **WHEN** the checkout on `main` has a modified tracked `a.txt`, a staged `s.txt`, and an untracked `drafts/x`, and `fastForward` names a commit whose parent is HEAD and which changes only `b.txt`
- **THEN** it returns `done`, HEAD is that commit, `b.txt` matches it, `a.txt` is still modified, `s.txt` is still staged, and `drafts/x` remains

#### Scenario: Uncommitted file the commit changes
- **WHEN** the checkout has a modified tracked `b.txt` and `fastForward` names a commit that changes `b.txt`
- **THEN** it returns `blocked` with `['b.txt']`, and HEAD and `b.txt` are unchanged

#### Scenario: Not a fast-forward
- **WHEN** `main` has a commit that the named commit does not contain
- **THEN** `fastForward` fails with git's output and HEAD is unchanged

#### Scenario: Counting commits
- **WHEN** `side` has two commits `main` lacks
- **THEN** `countCommits('main', 'side')` is 2, `countCommits('side', 'main')` is 0, and `countCommits('missing', 'main')` is 0

#### Scenario: Fast-forward reports changed paths
- **WHEN** `fastForward` names a commit whose parent is HEAD and which changes only `b.txt`
- **THEN** it returns `{ status: 'done', blocked: [], changed: ['b.txt'] }`

#### Scenario: Commit with extra parents
- **WHEN** branches `side` and `other` were each cut from `main` with one more commit, and `commitTree('main', 'main', message, 'osq <osq@example.invalid>', ['side', 'other'])` runs
- **THEN** the new commit's tree equals `main`'s tip tree, its parents are `main`'s tip, `side`'s tip and `other`'s tip in that order, and HEAD, `main`, `indexDigest`, and `status` are unchanged

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
   `skipVerify` set the suffix is left out. It SHALL then merge, without
   committing, the commit "Sync takes landed branch tips" names: the default
   branch itself, or a bridge commit holding its tree. A conflict at a
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
  archived before <folder> and also writes <capabilities>; land it first`. A
  change with no `archived` event SHALL not be compared. A change stacked on
  this change SHALL not be compared either: one whose `.run/stacked-on` names
  this change, or names a change that is itself stacked on this change, as
  read from the archived folders of the changes archived in osq worktrees.

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
- **THEN** it refuses with `001-<words> archived before 002-<words> and also writes orders; land it first`

#### Scenario: Earlier change on other capabilities
- **WHEN** `001` archived first and writes only `billing`, and `002` writes only `orders`
- **THEN** `osq land 002` lands `002`

#### Scenario: Earlier change stacked on this one
- **WHEN** `002`'s archived `.run/stacked-on` names `001`, both write `orders`, neither has landed, `002`'s `archived` event is earlier than `001`'s, as after `001` was steered and archived again, and `osq land 001` runs
- **THEN** it lands `001`, and `osq land 002` then lands `002`

#### Scenario: Earlier change stacked through another
- **WHEN** `003`'s archived `.run/stacked-on` names `002`, `002`'s names `001`, `001` and `003` both write `orders`, none has landed, `003`'s `archived` event is earlier than `001`'s, and `osq land 001` runs
- **THEN** it lands `001`
