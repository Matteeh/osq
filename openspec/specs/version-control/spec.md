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
<!-- source: src/core/vcs/vcs.ts, src/core/vcs/git-vcs.ts, src/core/vcs/no-vcs.ts, tests/vcs.test.ts -->
The `Vcs` port SHALL offer these reads: the repository root, HEAD's commit and
the branch it points to, a digest of the index, the stash list with the branch
each entry was made on, status, a git config value, and the names of the
active commit hooks. Its writes are those of "Vcs write operations". Status
SHALL list untracked files one by one and leave ignored files out, with paths
relative to the project root. `GitVcs` SHALL run the git binary with the
project root as its working directory, SHALL remove `GIT_DIR`,
`GIT_INDEX_FILE` and `GIT_WORK_TREE` from the child environment, and SHALL
bound every read by `timeouts.gitSeconds`, 10 when unset. `NoVcs` SHALL return
a null root, a null commit and branch, an empty digest, null config values,
and empty lists, and SHALL carry the reason git is off.

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

### Requirement: Vcs selection
<!-- source: src/core/vcs/select.ts, tests/vcs.test.ts -->
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
<!-- source: src/core/vcs/vcs.ts, src/core/vcs/git-vcs.ts, src/core/vcs/git-vcs-write.ts, src/core/vcs/no-vcs.ts, tests/vcs-write.test.ts -->
The `Vcs` port SHALL offer these writes. `createBranch` SHALL create a branch
at a base commit and fail when the branch exists. `worktreeAdd` SHALL add a
worktree for an existing branch. `worktreeRemove` SHALL remove a worktree and
fail, removing nothing, when it has changes outside ignored files.
`worktreeList` SHALL list every worktree with its path, branch, and HEAD.
`commit` SHALL stage exactly the given paths, commit them with the given
message and author, run the repository's hooks, and return the new commit. A
commit that fails or exceeds `timeouts.gitCommitSeconds` SHALL fail with git's
combined output. `patch` SHALL return a binary diff against HEAD of every
change, untracked files included, built through a temporary index so the real
index is unchanged. `discard` SHALL restore the given paths to HEAD and remove
untracked files under them, never ignored ones. It SHALL first assert that the
tree is a linked worktree and that HEAD is on a branch starting `osq/`, and
fail without touching anything when either does not hold. Under `NoVcs`,
every write SHALL fail naming the reason git is off.

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

### Requirement: Operations osq never runs
<!-- source: src/core/vcs/git-vcs.ts, src/core/vcs/git-vcs-write.ts, tests/vcs-write.test.ts -->
The `Vcs` port SHALL have no operation that force-pushes, pushes, rebases,
amends, resets, rewrites history, deletes a branch or tag, stashes, cleans
ignored files, or removes a worktree by force. No git argument list in
`src/core/vcs/` SHALL contain `--force`, `--amend`, `--hard`, `-D`, `-x`,
`rebase`, `reset`, `filter-branch`, `push`, or `--no-verify`.

#### Scenario: Forbidden argument
- **WHEN** a git argument list in `src/core/vcs/` contains `--force`
- **THEN** the structural test fails and names the file
