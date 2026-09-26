## MODIFIED Requirements

### Requirement: Vcs write operations
<!-- source: src/core/vcs/vcs.ts, src/core/vcs/git-vcs.ts, src/core/vcs/git-vcs-write.ts, src/core/vcs/no-vcs.ts, tests/vcs-write.test.ts, tests/vcs-discard-commit.test.ts -->
The `Vcs` port SHALL offer these writes. `createBranch` SHALL create a branch
at a base commit and fail when the branch exists. `worktreeAdd` SHALL add a
worktree for an existing branch. `worktreeRemove` SHALL remove a worktree and
fail, removing nothing, when it has changes outside ignored files.
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
