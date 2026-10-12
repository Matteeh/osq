## MODIFIED Requirements

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
the child environment, SHALL set `GIT_OPTIONAL_LOCKS=0` in it, so that a read
such as status never writes the index or holds `index.lock` while another
osq process commits in the same tree, and SHALL bound every read by
`timeouts.gitSeconds`, 10 when unset. `pathExists` SHALL return false, not
fail, for a ref that does not exist. `NoVcs` SHALL return a null root, a null
commit and branch, an empty digest, null config values, a null file from
`show`, false from `pathExists`, empty lists, and `main` as the default
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

#### Scenario: File at a branch
- **WHEN** branch `osq/001-a` holds `notes.txt` with `hello` and the checkout does not
- **THEN** `show('osq/001-a', 'notes.txt')` returns `hello`, and `show('osq/001-a', 'missing.txt')` returns null

#### Scenario: Path at a branch
- **WHEN** branch `osq/001-a` holds `dir/notes.txt` and the checkout does not
- **THEN** `pathExists('osq/001-a', 'dir')` and `pathExists('osq/001-a', 'dir/notes.txt')` are true, `pathExists('osq/001-a', 'other')` and `pathExists('main', 'dir')` are false, `pathExists('osq/none', 'dir')` is false, and `NoVcs` returns false

#### Scenario: Status leaves the index alone
- **WHEN** a temporary repository commits `a.txt`, then `a.txt`'s modification time moves one minute ahead with its content unchanged, and `GitVcs` reads status
- **THEN** status lists nothing and the bytes of the repository's index file are the same as before the read
