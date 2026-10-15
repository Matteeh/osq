## MODIFIED Requirements

### Requirement: Approval refusals under version control
With `vcs.enabled` and `GitVcs` selected, approve SHALL refuse, after lint and
before the digest, writing nothing, when:

- HEAD is not on the default branch and `--base-ok` is not passed, with
  `HEAD is on <branch>, not the default branch <default>; pass --base-ok to approve from it`,
  where a detached HEAD reads `a detached HEAD`;
- uncommitted changes in the checkout, by path or rename source, are covered
  by any task's `scope` and `--ignore-dirty` is not passed, with
  `uncommitted changes in task scope: <paths>; keep them with osq manual "<why>", commit them, or pass --ignore-dirty`,
  or, when `vcs.manualEdits` is `block`, with
  `uncommitted changes in task scope: <paths>; commit them or pass --ignore-dirty`,
  paths sorted and comma-separated;
- branch `osq/<folder>` already exists and "Rejected branch kept at approval"
  does not rename it, with `branch osq/<folder> already exists`.

A `depends_on` entry that is approved and has not landed is not a refusal;
"Stacked approval" says what approve does instead. A change that runs in a
worktree and needs steering is not a refusal either; "Approval after steering"
says what approve does instead, and none of these refusals applies to it.

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

#### Scenario: Running change that needs no steering
- **WHEN** a change runs in a worktree with a pending task and no trigger, and a human runs `osq approve <id>`
- **THEN** approve fails with `branch osq/<folder> already exists` and the worktree's HEAD is unchanged

#### Scenario: Dirty scope under each mode
- **WHEN** a task's `scope` is `src/**`, `src/dirty.ts` has uncommitted edits, and approve runs with `vcs.manualEdits` as the row says
- **THEN** it fails with the row's message

| vcs.manualEdits | message |
| --- | --- |
| unset | `uncommitted changes in task scope: src/dirty.ts; keep them with osq manual "<why>", commit them, or pass --ignore-dirty` |
| `block` | `uncommitted changes in task scope: src/dirty.ts; commit them or pass --ignore-dirty` |
