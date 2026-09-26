## MODIFIED Requirements

### Requirement: Vcs port
<!-- source: src/core/vcs/vcs.ts, src/core/vcs/git-vcs.ts, src/core/vcs/no-vcs.ts, tests/vcs.test.ts, tests/vcs-worktree-setup.test.ts -->
The `Vcs` port SHALL offer these reads: the repository root, HEAD's commit and
the branch it points to, a digest of the index, the stash list with the branch
each entry was made on, status, a git config value, the names of the active
commit hooks, and the default branch. Its writes are those of "Vcs write
operations". Status SHALL list untracked files one by one and leave ignored
files out, with paths relative to the project root. The default branch SHALL
be the branch `refs/remotes/origin/HEAD` names without its `origin/` prefix,
read locally without contacting the remote, else `vcs.defaultBranch`, else
`main`. `GitVcs` SHALL run the git binary with the project root as its working
directory, SHALL remove `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` from
the child environment, and SHALL bound every read by `timeouts.gitSeconds`, 10
when unset. `NoVcs` SHALL return a null root, a null commit and branch, an
empty digest, null config values, empty lists, and `main` as the default
branch, and SHALL carry the reason git is off.

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

## ADDED Requirements

### Requirement: Worktree location
<!-- source: src/core/vcs/worktree.ts, tests/vcs-worktree-setup.test.ts -->
A change's worktree SHALL live at `<vcs.worktreeRoot>/<repo>/<folder>`, where
`vcs.worktreeRoot` defaults to `~/.osq/worktrees`, a leading `~` expands to
the home directory, `<repo>` is the folder name of the repository root, and
`<folder>` is the change folder's name. Its branch SHALL be `osq/<folder>`.

#### Scenario: Default root
- **WHEN** the repository root is `/src/osq`, the home directory is `/home/u`, and `vcs.worktreeRoot` is unset
- **THEN** the worktree of `089-approve-into-worktree` is `/home/u/.osq/worktrees/osq/089-approve-into-worktree`

#### Scenario: Configured root
- **WHEN** `vcs.worktreeRoot` is `/tmp/wt` and the repository root is `/src/osq`
- **THEN** the worktree of `089-approve-into-worktree` is `/tmp/wt/osq/089-approve-into-worktree`
