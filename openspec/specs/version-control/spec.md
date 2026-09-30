# version-control Specification

## Purpose
Reads the project's git state through one port, so the watcher and doctor can
see what moved during a task without ever writing to git.

## Requirements

### Requirement: Code ownership
<!-- source: src/core/vcs/**, tests/vcs*.test.ts -->
The Version Control capability SHALL own the `Vcs` port, its git and no-git
implementations, their selection, the git state snapshot and its comparison,
the doctor git check's code, and their tests.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for the Vcs port, selection, snapshot, or doctor git check code
- **THEN** system maps `src/core/vcs/**` and `tests/vcs*.test.ts` to version-control

### Requirement: Vcs port
The `Vcs` port SHALL offer these reads: the repository root, HEAD's commit and
the branch it points to, a digest of the index, the stash list with the branch
each entry was made on, status, a git config value, the names of the active
commit hooks, the default branch, `show`, one file's contents at a ref, or
null when that ref has no such file, and `pathExists`, whether a file or
directory exists at a ref. Its writes are those of "Vcs write
operations". Status SHALL list untracked files one by one and leave ignored
files out, with paths relative to the project root. The default branch SHALL
be the branch `refs/remotes/origin/HEAD` names without its `origin/` prefix,
read locally without contacting the remote, else `vcs.defaultBranch`, else
`main`. `GitVcs` SHALL run the git binary with the project root as its working
directory, SHALL remove `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` from
the child environment, and SHALL bound every read by `timeouts.gitSeconds`, 10
when unset. `pathExists` SHALL return false, not fail, for a ref that does not
exist. `NoVcs` SHALL return a null root, a null commit and branch, an
empty digest, null config values, a null file from `show`, false from
`pathExists`, empty lists, and `main` as the default branch, and SHALL carry
the reason git is off.

#### Scenario: Stash on a branch
- **WHEN** a file is stashed on branch `main` of a temporary repository
- **THEN** the stash list holds one entry whose branch is `main`

#### Scenario: Detached HEAD
- **WHEN** a temporary repository checks out a commit directly
- **THEN** head reports that commit and a null branch

#### Scenario: Untracked file in a new folder
- **WHEN** a temporary repository has an untracked file `a/b.txt` and an ignored file
- **THEN** status lists `a/b.txt` and not the ignored file

#### Scenario: GIT_DIR in the environment
- **WHEN** `GIT_DIR` names another repository while `GitVcs` reads a temporary repository
- **THEN** every read reports the temporary repository

#### Scenario: Active hooks
- **WHEN** a repository has an executable `pre-commit` hook and a `commit-msg.sample`
- **THEN** the hook names are `pre-commit` only

#### Scenario: Default branch from origin
- **WHEN** a temporary repository's `refs/remotes/origin/HEAD` points to `refs/remotes/origin/trunk` and `vcs.defaultBranch` is `develop`
- **THEN** the default branch is `trunk`

#### Scenario: Default branch without a remote
- **WHEN** a temporary repository has no remote
- **THEN** the default branch is `vcs.defaultBranch` when set, and `main` otherwise

#### Scenario: File at a branch
- **WHEN** branch `osq/001-a` holds `notes.txt` with `hello` and the checkout does not
- **THEN** `show('osq/001-a', 'notes.txt')` returns `hello`, and `show('osq/001-a', 'missing.txt')` returns null

#### Scenario: Path at a branch
- **WHEN** branch `osq/001-a` holds `dir/notes.txt` and the checkout does not
- **THEN** `pathExists('osq/001-a', 'dir')` and `pathExists('osq/001-a', 'dir/notes.txt')` are true, `pathExists('osq/001-a', 'other')` and `pathExists('main', 'dir')` are false, `pathExists('osq/none', 'dir')` is false, and `NoVcs` returns false

### Requirement: Vcs selection
The system SHALL select `GitVcs` only when the git binary runs and the project
root, with symbolic links resolved, is the top level of a git repository.
Otherwise it SHALL select `NoVcs` with one of the reasons `git not found`,
`not a git repository`, or `not the repository root`. The watcher and doctor
SHALL select through this one function.

#### Scenario: Folder below the root
- **WHEN** the project root is a folder inside a repository but not its top level
- **THEN** selection returns `NoVcs` with reason `not the repository root`

#### Scenario: Plain folder
- **WHEN** the project root is a temporary folder outside any repository
- **THEN** selection returns `NoVcs` with reason `not a git repository`

### Requirement: Vcs write operations
The `Vcs` port SHALL offer these writes. `createBranch` SHALL create a branch
at a base commit and fail when the branch exists. `renameBranch` SHALL rename
a branch, keeping every commit it holds, and fail, changing nothing, when the
new name exists. `worktreeAdd` SHALL add a
worktree for an existing branch. `worktreeRemove` SHALL remove a worktree and
fail, removing nothing, when it has changes outside ignored files.
`worktreePrune` SHALL drop git's records of worktrees whose directory no
longer exists, and never touch a directory.
`worktreeList` SHALL list every worktree with its path, branch, and HEAD.
`commit` SHALL stage exactly the given paths, commit only those paths with the
given message and author, leaving anything else staged as it was, or commit
the index as it stands when given no paths, run the
repository's hooks, and return the new commit. A commit that fails or exceeds
`timeouts.gitCommitSeconds` SHALL fail with git's combined output. `patch`
SHALL return a binary diff against HEAD of every change, untracked files
included, built through a temporary index so the real index is unchanged.
`discard` SHALL restore the given paths to HEAD in the index and the working
tree, remove files under them that HEAD lacks, staged or untracked, and never
remove ignored ones. Under `GitVcs`, given no paths, it SHALL return without
running git. It
SHALL first assert that the tree is a linked worktree and that HEAD is on a
branch starting `osq/`, and fail without touching anything when either does
not hold. Under `NoVcs`, every write SHALL fail naming the reason git is off.

#### Scenario: Branch exists
- **WHEN** `createBranch` names a branch that already exists
- **THEN** it fails and the branch still points where it did

#### Scenario: Rename a branch
- **WHEN** `renameBranch('osq/001-a', 'osq/001-a-rejected-1')` runs in a temporary repository where only `osq/001-a` exists
- **THEN** `osq/001-a-rejected-1` points at the commit `osq/001-a` pointed at, and `listBranches('osq/001-a')` no longer lists `osq/001-a`

#### Scenario: Rename onto a taken name
- **WHEN** `renameBranch('osq/001-a', 'osq/001-b')` runs and `osq/001-b` exists
- **THEN** it fails, and both branches still point where they did

#### Scenario: Dirty worktree kept
- **WHEN** `worktreeRemove` targets a worktree with a modified tracked file
- **THEN** it fails and the worktree and the file remain

#### Scenario: Hook rejects a commit
- **WHEN** a `pre-commit` hook exits 1 with `blocked by hook`
- **THEN** `commit` fails with output containing `blocked by hook`, and HEAD is unchanged

#### Scenario: Patch with a new file
- **WHEN** a worktree has a modified tracked file and a new untracked file
- **THEN** `patch` returns a diff containing both, applying it to a clean copy reproduces them, and `indexDigest` is unchanged

#### Scenario: Discard outside an osq worktree
- **WHEN** `discard` runs in a checkout, or in a linked worktree on branch `feature/x`
- **THEN** it fails and every file is unchanged

#### Scenario: Discard keeps ignored files
- **WHEN** `discard` runs in an osq worktree over a folder holding a modified file, an untracked file, and an ignored file
- **THEN** the modified file is restored, the untracked file is gone, and the ignored file remains

#### Scenario: Discard with no paths
- **WHEN** `discard` is given an empty list in an osq worktree holding an untracked file
- **THEN** it runs no git command and the untracked file remains

#### Scenario: Discard a staged new file
- **WHEN** `discard` runs over a new file that was staged with `git add` and a tracked file modified and staged
- **THEN** the new file is gone from the index and the tree, the tracked file matches HEAD in both, and `status` is empty

#### Scenario: Commit leaves other staged paths
- **WHEN** `a.txt` is staged and `commit` is given only `b.txt`
- **THEN** the new commit changes only `b.txt`, and `a.txt` is still staged

#### Scenario: Prune a deleted worktree
- **WHEN** a linked worktree's directory is deleted by hand and `worktreePrune` runs
- **THEN** `worktreeList` no longer lists it, and every other worktree remains

### Requirement: Operations osq never runs
The `Vcs` port SHALL have no operation that force-pushes, pushes, rebases,
amends, resets, rewrites history, deletes a branch or tag, stashes, cleans
ignored files, or removes a worktree by force. No git argument list in
`src/core/vcs/` SHALL contain `--force`, `--amend`, `--hard`, `-D`, `-x`,
`rebase`, `reset`, `filter-branch`, `push`, or `--no-verify`.

#### Scenario: Forbidden argument
- **WHEN** a git argument list in `src/core/vcs/` contains `--force`
- **THEN** the structural test fails and names the file

### Requirement: Worktree location
A change's worktree SHALL live at `<vcs.worktreeRoot>/<repo>/<folder>`, where
`vcs.worktreeRoot` defaults to `~/.osq/worktrees`, a leading `~` expands to
the home directory, `<repo>` is the folder name of the repository root, and
`<folder>` is the change folder's name. Its branch SHALL be `osq/<folder>`.
A change's stacked approval SHALL live at
`<vcs.worktreeRoot>/<repo>/.stacked/<folder>`, with the same root, `<repo>`,
and `<folder>`.

#### Scenario: Default root
- **WHEN** the repository root is `/src/osq`, the home directory is `/home/u`, and `vcs.worktreeRoot` is unset
- **THEN** the worktree of `089-approve-into-worktree` is `/home/u/.osq/worktrees/osq/089-approve-into-worktree`

#### Scenario: Configured root
- **WHEN** `vcs.worktreeRoot` is `/tmp/wt` and the repository root is `/src/osq`
- **THEN** the worktree of `089-approve-into-worktree` is `/tmp/wt/osq/089-approve-into-worktree`

#### Scenario: Stacked approval path
- **WHEN** `vcs.worktreeRoot` is `/tmp/wt` and the repository root is `/src/osq`
- **THEN** the stacked approval of `094-stacking` is `/tmp/wt/osq/.stacked/094-stacking`

### Requirement: Worktree recreation
With `vcs.enabled` and `GitVcs` selected for the project root, `osq watch`
SHALL, before its first cycle, find every branch starting with `osq/` whose
worktree is missing: no worktree has it checked out, or the worktree that has
it lists a directory that no longer exists. For each one whose tip holds
`<changes directory>/<folder>/.run/approved`, where `<folder>` is the branch
name without `osq/`, it SHALL recreate the worktree: run `worktreePrune` once
when any listed worktree directory is gone, add the worktree at the path
"Worktree location" gives, run `vcs.prepare` there as approval does, and log
`recreated worktree <path> for <folder>`. A branch whose tip lacks that file,
because its change archived or was never approved, SHALL get no worktree. A
recreation that fails SHALL log its error and leave the other branches to be
recreated. With `vcs.enabled` off, or under `NoVcs`, it SHALL do nothing.

#### Scenario: Deleted worktree directory
- **WHEN** a change was approved into a worktree and the worktree's directory is deleted by hand
- **THEN** `osq watch --once` recreates it at the same path on `osq/<folder>`, logs the recreated line, and runs the change's next task there

#### Scenario: Removed worktree
- **WHEN** the worktree was removed with `git worktree remove`
- **THEN** `osq watch --once` recreates it

#### Scenario: Archived change
- **WHEN** an `osq/` branch's tip holds the change only under the archive directory and it has no worktree
- **THEN** no worktree is created

#### Scenario: Flag off
- **WHEN** `vcs.enabled` is off and an `osq/` branch has no worktree
- **THEN** no worktree is created and no git write runs

### Requirement: Vcs merge operations
The `Vcs` port SHALL also offer `merge`, `mergeAbort`, `stage`, and
`isAncestor`. `merge(ref, squash)` SHALL run `git merge --no-ff --no-commit
<ref>` when `squash` is false, leaving the merge uncommitted, and
`git merge --squash <ref>` when it is true. It SHALL return `clean` with an
empty path list, or `conflict` with the unmerged paths, relative to the
project root and sorted. When git refuses to start the merge, as over local
changes or an untracked file the merge would overwrite, `merge` SHALL fail
with git's output and leave the tree and the index as they were.
`mergeAbort()` SHALL run `git merge --abort`. `stage(paths)` SHALL stage
exactly the given paths, including deletions. `isAncestor(ancestor,
descendant)` SHALL be true when `ancestor` is `descendant` or one of its
ancestors, and false otherwise, including for a ref that does not exist.
Under `NoVcs`, `isAncestor` SHALL return false, and `merge`, `mergeAbort`, and
`stage` SHALL fail naming the reason git is off.

#### Scenario: Clean merge left uncommitted
- **WHEN** branch `side` changes `b.txt`, `main` changes `a.txt`, and `merge('side', false)` runs on `main`
- **THEN** it returns `clean`, both changes are in the tree and staged, and HEAD is unchanged until `commit` with no paths makes a commit whose parents are the old HEAD and `side`

#### Scenario: Conflict and abort
- **WHEN** `main` and `side` both change the same line of `a.txt` and `merge('side', false)` runs on `main`
- **THEN** it returns `conflict` with `['a.txt']`, and after `mergeAbort` HEAD is unchanged and `status` is empty

#### Scenario: Squash of a branch that contains HEAD
- **WHEN** branch `side` was cut from `main`'s tip and has two more commits, and `merge('side', true)` runs on `main`
- **THEN** it returns `clean`, HEAD is unchanged, and `commit` with no paths makes one commit whose only parent is the old HEAD and whose tree equals `side`'s tip

#### Scenario: Untracked file in the way
- **WHEN** `side` adds `c.txt` and the checkout has an untracked `c.txt`
- **THEN** `merge('side', true)` fails, and the untracked `c.txt` and the index are unchanged

#### Scenario: Ancestry
- **WHEN** `side` was cut from `main` and has one more commit
- **THEN** `isAncestor('main', 'side')` is true, `isAncestor('side', 'main')` is false, `isAncestor('main', 'main')` is true, and `isAncestor('missing', 'main')` is false

### Requirement: Default branch sync
`syncWithDefaultBranch` in `src/core/vcs/sync-main.ts` SHALL take the default
branch into a change's branch, in the change's worktree, for a change that is
active or archived there, and report whether it merged. It SHALL take an
optional progress callback. When the default branch's tip is already an
ancestor of the worktree's HEAD, it SHALL write nothing, call no callback, and
report no merge. Otherwise it SHALL work in this order. Every stop SHALL throw
a `SyncStop`, an `Error` from `src/core/vcs/sync-stop.ts` whose `reason` is
`sync_conflict` for the conflict stop of step 2 and `sync_failed` for every
other stop. Every stop SHALL leave the worktree's HEAD where it was, and every
tracked file outside the change folder's `.run/` as it was. Before it first
writes the change folder's `.run/events/change.jsonl`, it SHALL keep that
file's contents, or note that it is absent. After any abort, it SHALL write
those contents back, or remove the file when it was absent. Lines that were
not committed before the sync then survive a stop:

1. Before writing anything, for every capability with a delta in the change
   folder, it SHALL compare every requirement the delta names under
   `## MODIFIED Requirements` or `## REMOVED Requirements`, or as a
   `## RENAMED Requirements` source, between the living spec at the commit in
   `.run/base` and the living spec at the default branch's tip. It compares the
   requirement's full text as `parseCapabilitySpec` returns it. When any of
   them differs or is missing on the default branch, it SHALL stop with
   `<folder>: <default branch> changed requirements this change rewrites since
   it was approved: <capability>: <requirement>, ...; reject the change and
   plan it again against <default branch>`.
2. It SHALL call the progress callback once with `<default branch> has <n> new
   commits; merging into osq/<folder>` and a verify suffix, where `<n>` is
   `countCommits` from the worktree's HEAD to the default branch, and
   `commits` reads `commit` when `<n>` is 1. For an archived change the suffix
   is ` and running verify: <command>`, left out when the proposal has no
   `verify`. For an active change it is ` and re-running verify for tasks
   <n>, ...`, naming the tasks step 5 runs, left out when there are none. It
   SHALL then merge the default branch without committing. A conflict at a
   path under the living specs directory or under the archive directory is
   resolved in step 3. A conflict at any other path SHALL abort the merge and
   stop with `<folder>: <paths, comma-separated> conflict with <default
   branch>; merge it into osq/<folder> by hand in <worktree>, then run osq
   land <id> again` for an archived change, and with the same text ending
   `then run osq retry <id> change` for an active change.
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
   branch>:` and the same tail. For each passing command, it SHALL append to
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
- **THEN** the sync stops naming `orders: Order totals`, and the worktree's HEAD and status are unchanged

#### Scenario: Code conflict
- **WHEN** the default branch and `002` both changed the same line of `src/app.txt`
- **THEN** the sync stops naming `src/app.txt`, and the worktree's HEAD and status are unchanged

#### Scenario: Red verify after the merge
- **WHEN** the merged tree makes the proposal's `verify` exit 1 after printing `broken`
- **THEN** the sync stops with the verify line and output holding `broken`, and the worktree's HEAD and status are unchanged

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
- **THEN** the sync throws a `SyncStop` with reason `sync_failed` whose message starts `002-<words>: verify of task 1 failed`, and the worktree's HEAD is unchanged

#### Scenario: Code conflict in an active change
- **WHEN** `002` is active and the default branch and `002` both changed the same line of `src/app.txt`
- **THEN** the sync throws a `SyncStop` with reason `sync_conflict` whose message names `src/app.txt` and ends `then run osq retry 002 change`, and the worktree's HEAD is unchanged

#### Scenario: Failed commit keeps uncommitted events
- **WHEN** `002` is active, its `.run/events/change.jsonl` has a line that is not committed, the default branch has moved, and a `pre-commit` hook exits 1
- **THEN** the sync throws a `SyncStop` with reason `sync_failed`, the worktree's HEAD is unchanged, and `.run/events/change.jsonl` holds exactly what it held before the sync, that line included

#### Scenario: Stacked dependent after its dependency landed
- **WHEN** `002` was cut from `001`'s archive commit and is active, the default branch then moved, and `001` landed through `osq land`, whose sync appended to `001`'s archived `.run/events/change.jsonl`
- **THEN** the sync of `002` commits `osq: 002 sync main`, `001`'s archive folder on `002`'s branch equals the default branch's copy, and no file on the branch holds a conflict marker

#### Scenario: Red check after the merge
- **WHEN** an archived change's proposal has `check: node check.cjs`, its `verify` passes on the merged tree, and `node check.cjs` exits 1 after printing `smoke failed`
- **THEN** the sync throws a `SyncStop` with reason `sync_failed` whose message holds `check failed on osq/<folder>` and `smoke failed`, and the worktree's HEAD and status are unchanged

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

#### Scenario: Earlier change shares a capability
- **WHEN** `001` and `002` both archived and neither has landed, `001` archived first, both write `orders`, and `osq land 002` runs
- **THEN** it refuses with `001-<words> archived before 002-<words> and also writes orders; land it first, or reject it`

#### Scenario: Earlier change on other capabilities
- **WHEN** `001` archived first and writes only `billing`, and `002` writes only `orders`
- **THEN** `osq land 002` lands `002`

### Requirement: Land cleanup
After a land commit, and for a change the default branch already holds,
`landChange` SHALL remove the worktree at the path "Worktree location" gives
when `worktreeList` lists it, printing `Removed worktree <path>`. When
`worktreeRemove` fails, it SHALL print `Kept worktree <path>:` and git's
output, and still exit zero. It SHALL neither read nor remove a folder of the
change's name in the checkout. When `osq land <id>` names a change the default
branch already holds, as `readDependencyState` reads it, it SHALL print
`<folder> has already landed`, clean up, and exit zero. When nothing is left
to remove, it SHALL print `<folder> has already landed; nothing to clean up`.

#### Scenario: Landed by hand, worktree kept
- **WHEN** a change was landed with `git merge --squash` and `osq message <id> | git commit -F -`, and its worktree remains
- **THEN** `osq land <id>` prints `<folder> has already landed`, removes the worktree, and makes no commit

#### Scenario: Nothing to clean up
- **WHEN** `osq land <id>` runs again for the same change
- **THEN** it prints `<folder> has already landed; nothing to clean up` and exits zero

#### Scenario: Edited leftover copy is kept
- **WHEN** the checkout holds an untracked folder named like the change, as an approval before change 123 left behind, and the change lands
- **THEN** `osq land` lands the change, leaves that folder in place, and prints no line about it

### Requirement: Vcs land operations
The `Vcs` port SHALL also offer `commitTree`, `fastForward`, and
`countCommits`. `commitTree(source, parent, message, author)` SHALL write a
commit whose tree is the tree of commit `source`, whose only parent is
`parent`, whose message is `message`, passed to git in a file and never as an
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

### Requirement: Land from the verified tree
After the refusals, `landChange` SHALL run `syncWithDefaultBranch` for the
change, passing on its progress callback, and stop with the sync's message
when it stops. It SHALL run no other `verify`: when the sync reports no merge,
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

### Requirement: Sync on request
`syncChange(projectRoot, config, id, progress)` in
`src/core/vcs/sync-change.ts` SHALL find the change the id matches, as
`matchesFolder` does, among the active and archived changes of the osq
worktree trees `listChanges` reports. It SHALL refuse, writing nothing, in
this order:

- With `vcs.enabled` off or `NoVcs` selected: `osq sync needs vcs.enabled and
  git`.
- When no such change exists: `No change "<id>" runs in an osq worktree`.
- When `deriveSpecState` reports a task of the change as running: `<folder>
  has a task running; run osq sync <id> after it ends`.
- When `awaitedDependencies` lists any entry for the change: `<folder> is
  stacked on <folders, comma-separated>, which has not landed; land it first`.
- When the worktree's `status` lists a path outside the change folder's
  `.run/` other than its `tasks.md`: `<worktree> has uncommitted changes:
  <paths>; commit or discard them first`.

It SHALL then run `syncWithDefaultBranch` for the change, passing on its
progress callback, and return `Synced osq/<folder> with <default branch>` when
the sync merged and `osq/<folder> already has <default branch>` when it did
not. When the sync stops for an active change, `syncChange` SHALL append to
the change folder's `.run/events/change.jsonl` a `sync_stopped` event whose
data holds `reason`, the stop's `reason` or `sync_failed` for any other error,
`message`, and `defaultBranch`. It SHALL leave that file uncommitted and then
throw the stop's message. For an archived change it SHALL append nothing,
because `osq land` refuses a worktree with any uncommitted file. `syncChange`
SHALL write no marker under `.run/`; halting belongs to the watcher.

#### Scenario: Sync an active change
- **WHEN** a change approved into a worktree has one verified task and the default branch has moved
- **THEN** `syncChange` returns `Synced osq/<folder> with main`, and the branch tip is `osq: <id> sync main`

#### Scenario: Nothing to take in
- **WHEN** the default branch has not moved since approval
- **THEN** `syncChange` returns `osq/<folder> already has main` and the branch tip is unchanged

#### Scenario: Task running
- **WHEN** a task of the change holds a live lock in `.run/running/`
- **THEN** `syncChange` refuses with `<folder> has a task running; run osq sync <id> after it ends`, and the branch tip is unchanged

#### Scenario: Stacked on an unlanded change
- **WHEN** the change was cut from `001`'s archive commit and `001` has not landed
- **THEN** `syncChange` refuses with `<folder> is stacked on 001-<words>, which has not landed; land it first`

#### Scenario: Stop is recorded, not halted
- **WHEN** the sync of an active change stops on a code conflict in `src/app.txt`
- **THEN** `syncChange` throws the stop's message, the branch tip is unchanged, `.run/regressed/change.md` does not exist, and the change's `.run/events/change.jsonl` ends with an uncommitted `sync_stopped` event with reason `sync_conflict` whose message names `src/app.txt`

#### Scenario: Archived change stop leaves the worktree clean
- **WHEN** the sync of an archived change stops on a code conflict
- **THEN** `syncChange` throws the stop's message, and the worktree's `status` is empty

### Requirement: Land reports changed paths
`landChange` SHALL return, beside its lines and code, `changed`: the absolute
path of every file the land commit changes, built by joining each path in
`fastForward`'s `changed` list to the repository root that `vcs.root()`
returns, or to the project root when that is null. A land that makes no
commit, such as a change that has already landed, SHALL return an empty
`changed` list.

#### Scenario: Changed paths after a land
- **WHEN** `osq land 001` lands a change whose task wrote `src/one.txt`
- **THEN** `landChange`'s `changed` holds `<repository root>/src/one.txt`

#### Scenario: Nothing changed on cleanup
- **WHEN** `landChange` runs for a change that has already landed
- **THEN** its `changed` is empty
