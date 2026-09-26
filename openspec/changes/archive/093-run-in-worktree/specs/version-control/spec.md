## MODIFIED Requirements

### Requirement: Vcs port
<!-- source: src/core/vcs/vcs.ts, src/core/vcs/git-vcs.ts, src/core/vcs/no-vcs.ts, tests/vcs.test.ts, tests/vcs-worktree-setup.test.ts, tests/vcs-worktree-recreate.test.ts -->
The `Vcs` port SHALL offer these reads: the repository root, HEAD's commit and
the branch it points to, a digest of the index, the stash list with the branch
each entry was made on, status, a git config value, the names of the active
commit hooks, the default branch, and `show`, one file's contents at a ref, or
null when that ref has no such file. Its writes are those of "Vcs write
operations". Status SHALL list untracked files one by one and leave ignored
files out, with paths relative to the project root. The default branch SHALL
be the branch `refs/remotes/origin/HEAD` names without its `origin/` prefix,
read locally without contacting the remote, else `vcs.defaultBranch`, else
`main`. `GitVcs` SHALL run the git binary with the project root as its working
directory, SHALL remove `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` from
the child environment, and SHALL bound every read by `timeouts.gitSeconds`, 10
when unset. `NoVcs` SHALL return a null root, a null commit and branch, an
empty digest, null config values, a null file from `show`, empty lists, and
`main` as the default branch, and SHALL carry the reason git is off.

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

### Requirement: Vcs write operations
<!-- source: src/core/vcs/vcs.ts, src/core/vcs/git-vcs.ts, src/core/vcs/git-vcs-write.ts, src/core/vcs/no-vcs.ts, tests/vcs-write.test.ts, tests/vcs-discard-commit.test.ts, tests/vcs-worktree-recreate.test.ts -->
The `Vcs` port SHALL offer these writes. `createBranch` SHALL create a branch
at a base commit and fail when the branch exists. `worktreeAdd` SHALL add a
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

## ADDED Requirements

### Requirement: Worktree recreation
<!-- source: src/core/vcs/worktree-recreate.ts, src/cli/watch.ts, tests/vcs-worktree-recreate.test.ts -->
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
