## MODIFIED Requirements

### Requirement: Approval refusals under version control
With `vcs.enabled` and `GitVcs` selected, approve SHALL refuse, after lint and
before the digest, writing nothing, when:

- HEAD is not on the default branch and `--base-ok` is not passed, with
  `HEAD is on <branch>, not the default branch <default>; pass --base-ok to approve from it`,
  where a detached HEAD reads `a detached HEAD`;
- uncommitted changes in the checkout, by path or rename source, are covered
  by any task's `scope` and `--ignore-dirty` is not passed, with
  `uncommitted changes in task scope: <paths>; commit them or pass --ignore-dirty`,
  paths sorted and comma-separated;
- branch `osq/<folder>` already exists and "Rejected branch kept at approval"
  does not rename it, with `branch osq/<folder> already exists`.

A `depends_on` entry that is approved and has not landed is not a refusal;
"Stacked approval" says what approve does instead.

#### Scenario: Off the default branch
- **WHEN** approve runs from branch `topic` with `vcs.enabled`
- **THEN** it fails with the default-branch message naming `topic` and `main`, and with `--base-ok` it succeeds

#### Scenario: Dirty scope
- **WHEN** a file matching a task's `scope` has uncommitted edits
- **THEN** approve fails naming that file, and with `--ignore-dirty` it succeeds

#### Scenario: Branch exists
- **WHEN** `osq/<folder>` already exists
- **THEN** approve fails with `branch osq/<folder> already exists` and creates no worktree

#### Scenario: Unlanded dependency
- **WHEN** the change depends on another change that is approved and still active
- **THEN** approve does not fail, creates no branch, and records a stacked approval naming the dependency's folder

## ADDED Requirements

### Requirement: Rejected branch kept at approval
When branch `osq/<folder>` exists, its tip holds
`<changes>/rejected/<folder>/.run/rejected.md`, and no worktree has it
checked out, approve SHALL rename it to `osq/<folder>-rejected-<n>`, with the
lowest free `n` from 1, where the existing-branch refusal runs, then approve
as usual, stacked or not. `osq approve` SHALL print
`  Kept rejected branch: <new name>` after its `Hash:` line. Any other
existing branch SHALL still refuse.

#### Scenario: Rejected branch renamed
- **WHEN** `osq/001-a` exists, its tip commit holds `openspec/changes/rejected/001-a/.run/rejected.md`, and change 001 is approved again
- **THEN** the old tip is on `osq/001-a-rejected-1`, a new `osq/001-a` holds the approval commit, and the result's `keptBranch` is `osq/001-a-rejected-1`

#### Scenario: Rejected branch checked out
- **WHEN** that rejected `osq/001-a` is checked out in a worktree
- **THEN** approve fails with `branch osq/001-a already exists` and renames nothing

#### Scenario: Next free name
- **WHEN** `osq/001-a-rejected-1` already exists beside a rejected `osq/001-a`
- **THEN** approve renames `osq/001-a` to `osq/001-a-rejected-2`
