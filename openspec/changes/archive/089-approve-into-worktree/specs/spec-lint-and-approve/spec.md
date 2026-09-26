## ADDED Requirements

### Requirement: Approval into a worktree
<!-- source: src/core/spec/approve.ts, src/core/spec/approve-worktree.ts, src/cli/approve.ts, tests/approve-worktree.test.ts -->
With `vcs.enabled` and `GitVcs` selected, `osq approve` SHALL lint, review,
and hash the change folder in the checkout, committed or not. It SHALL then
create branch `osq/<folder>` at HEAD's commit and add its worktree at the path
"Worktree location" gives. When `vcs.prepare` is set, it SHALL run that
command once in the worktree, bounded by `timeouts.verifyTimeoutSeconds`. It
SHALL copy the checkout's folder into the worktree, and in the worktree's copy
append observed planning records, write `.run/approved` with the checkout
copy's hash, `.run/base` with the commit the branch was cut from, and
`.run/approver` with `<user.name> <<user.email>>` from git config, and write
the manifest. It SHALL commit that folder in the worktree as the branch's
first commit, with subject `osq: <id> approved` and author `vcs.author`, and
print `  Worktree: <path>` and `  Branch: osq/<folder>`. It SHALL write
nothing to the checkout. A failing prepare SHALL stop the approval with the
command's output and the worktree and branch names, and SHALL remove neither.
With `vcs.enabled` off or `NoVcs` selected, approval SHALL write in place as
before.

#### Scenario: Approve a draft
- **WHEN** a lint-clean uncommitted draft is approved with `vcs.enabled` on `main` of a temporary repository
- **THEN** branch `osq/<folder>` has one commit over HEAD, subject `osq: <id> approved`, author `vcs.author`, holding the folder with `.run/approved`, `.run/base`, and `.run/approver`, and `git status` of the checkout is unchanged

#### Scenario: Prepare runs in the worktree
- **WHEN** `vcs.prepare` writes a file named `prepared` into its working directory
- **THEN** that file exists in the worktree, not in the checkout

#### Scenario: Prepare fails
- **WHEN** `vcs.prepare` exits 1 after printing `boom`
- **THEN** approve fails with a message containing `boom`, and the branch and worktree remain

### Requirement: Approval refusals under version control
<!-- source: src/core/spec/approve-worktree.ts, src/cli/approve.ts, tests/approve-worktree.test.ts -->
With `vcs.enabled` and `GitVcs` selected, approve SHALL refuse, after lint and
before the digest, writing nothing, when:

- HEAD is not on the default branch and `--base-ok` is not passed, with
  `HEAD is on <branch>, not the default branch <default>; pass --base-ok to approve from it`,
  where a detached HEAD reads `a detached HEAD`;
- uncommitted changes in the checkout, by path or rename source, are covered
  by any task's `scope` and `--ignore-dirty` is not passed, with
  `uncommitted changes in task scope: <paths>; commit them or pass --ignore-dirty`,
  paths sorted and comma-separated;
- branch `osq/<folder>` already exists, with `branch osq/<folder> already exists`;
- a `depends_on` entry names an active change that has `.run/approved`, with
  `depends on <dependency folder>, which is approved and has not landed; approve this change after it lands`.

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
- **THEN** approve fails naming the dependency's folder
