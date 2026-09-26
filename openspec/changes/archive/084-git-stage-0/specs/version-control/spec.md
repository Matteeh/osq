# Spec Delta: Version Control

## Purpose

Reads the project's git state through one port, so the watcher and doctor can
see what moved during a task without ever writing to git.

## ADDED Requirements

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
The `Vcs` port SHALL offer only reads: the repository root, HEAD's commit and
the branch it points to, a digest of the index, the stash list with the branch
each entry was made on, and status. Status SHALL list untracked files one by
one and leave ignored files out, with paths relative to the project root.
`GitVcs` SHALL run the git binary with the project root as its working
directory, SHALL remove `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` from the
child environment, and SHALL bound every call by `timeouts.gitSeconds`, 10 when
unset. `NoVcs` SHALL return a null root, a null commit and branch, an empty
digest, and empty lists, and SHALL carry the reason git is off.

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
