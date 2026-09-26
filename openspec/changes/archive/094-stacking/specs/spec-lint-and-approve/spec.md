## MODIFIED Requirements

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
- branch `osq/<folder>` already exists, with `branch osq/<folder> already exists`.

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

### Requirement: Stack dependency state
<!-- source: src/core/spec/stack-dependencies.ts, tests/approve-stacked.test.ts -->
With `vcs.enabled` and `GitVcs` selected, the state of a dependency folder
`<dep>` SHALL be read from git and files, never from a worktree, where
`<changes>` and `<archive>` are the project root tree's changes and archive
directories relative to the project root:

- `landed` when `pathExists(<default branch>, <archive>/<dep>)`;
- otherwise, when branch `osq/<dep>` exists: `archived` with the hash in
  `<archive>/<dep>/.run/approved` at `osq/<dep>` and the base `osq/<dep>`
  when that file exists there, else `approved` with the hash in
  `<changes>/<dep>/.run/approved` at `osq/<dep>` when that file exists
  there, else `unapproved`;
- otherwise `approved` with the hash in `<dep>`'s stacked approval's
  `.run/approved` when it exists;
- otherwise `approved` with the hash in the checkout's
  `<changes>/<dep>/.run/approved` or `<archive>/<dep>/.run/approved` when
  either exists;
- otherwise `unapproved`.

Hashes SHALL be trimmed. A `depends_on` entry SHALL resolve to a folder name
by matching the change folders `listChanges` returns in every location, as
`findChange` matches an active one, and an entry that matches no folder SHALL
be left out.

#### Scenario: Dependency running in a worktree
- **WHEN** `001-a` was approved into a worktree and has not archived
- **THEN** its state is `approved` with the hash in its worktree's `.run/approved`

#### Scenario: Dependency archived on its branch
- **WHEN** `osq/001-a`'s tip holds `<archive>/001-a/.run/approved` and the default branch has no `<archive>/001-a`
- **THEN** its state is `archived` with that hash and the base `osq/001-a`

#### Scenario: Dependency landed
- **WHEN** the default branch holds `<archive>/001-a`
- **THEN** its state is `landed`, whatever `osq/001-a` holds

#### Scenario: Dependency rejected on its branch
- **WHEN** `osq/001-a`'s tip holds `001-a` only under the rejected directory
- **THEN** its state is `unapproved`

#### Scenario: Dependency is a draft
- **WHEN** `001-a` exists only in the checkout without `.run/approved`
- **THEN** its state is `unapproved`

### Requirement: Stacked approval
<!-- source: src/core/spec/approve.ts, src/core/spec/approve-worktree.ts, src/core/spec/stack-dependencies.ts, src/cli/approve.ts, tests/approve-stacked.test.ts -->
With `vcs.enabled` and `GitVcs` selected, when "Stack dependency state"
reports any of the change's `depends_on` entries as `approved` or
`archived`, approve SHALL, after lint, the refusals, and the review, record a
stacked approval instead of creating a branch. It SHALL delete any stacked
approval of the folder, copy the checkout's folder to
`<changes>/<folder>` inside the stacked approval directory "Worktree
location" gives, and in that copy append observed planning records, write
`.run/approved` with the checkout copy's hash, the manifest, and
`.run/approver` as "Approval into a worktree" does, and write
`.run/stacked-on` with one `<dependency folder> <approved hash>` line per
such entry, in `depends_on` order. It SHALL create no branch, worktree, or
commit, SHALL write nothing to the checkout, and SHALL print
`  Waiting for: <folders>`, comma-separated, and `  Stacked: <path>`. When
no entry is `approved` or `archived`, approve SHALL approve into a worktree
as "Approval into a worktree" says and then delete any stacked approval of
the folder. When the change locations module finds the change in a stacked
tree, approve SHALL lint, review, hash, and copy the checkout's folder of the
same name, and SHALL fail with `findChange`'s message when the checkout has
none.

#### Scenario: Approve a dependent of a running change
- **WHEN** `001-a` was approved into a worktree and the lint-clean draft `002-b` with `depends_on: ["001"]` is approved
- **THEN** approve prints `  Waiting for: 001-a` and `  Stacked: ` with the stacked path, that path holds `002-b` with `.run/approved`, `.run/approver`, and `.run/stacked-on` reading `001-a <001-a's hash>`, no branch `osq/002-b` exists, and `git status` of the checkout is unchanged

#### Scenario: Dependency already landed
- **WHEN** the default branch holds `001-a`'s archive and `002-b` is approved
- **THEN** approve creates `osq/002-b` and its worktree as before and prints no `Waiting for` line

#### Scenario: Approve a stacked change again
- **WHEN** `002-b` is stacked, a task file in the checkout's copy is edited, and `002-b` is approved again
- **THEN** the stacked approval's `.run/approved` holds the checkout copy's new hash and the edited task file

#### Scenario: Approve again after the dependency is rejected
- **WHEN** `002-b` is stacked on `001-a`, `001-a` is rejected on its branch, and `002-b` is approved again
- **THEN** approve creates `osq/002-b` at HEAD with its worktree, and the stacked approval directory of `002-b` no longer exists
