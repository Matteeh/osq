## MODIFIED Requirements

### Requirement: Vcs port
<!-- source: src/core/vcs/vcs.ts, src/core/vcs/git-vcs.ts, src/core/vcs/no-vcs.ts, tests/vcs.test.ts, tests/vcs-worktree-setup.test.ts, tests/vcs-worktree-recreate.test.ts, tests/vcs-path-exists.test.ts -->
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

### Requirement: Worktree location
<!-- source: src/core/vcs/worktree.ts, tests/vcs-worktree-setup.test.ts, tests/vcs-path-exists.test.ts -->
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
