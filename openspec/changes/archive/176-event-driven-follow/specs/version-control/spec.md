# Spec Delta: version-control

## ADDED Requirements

### Requirement: Tree record
The `GitVcs` that `selectVcs` returns SHALL append one line to the tree
record after each of these writes succeeds: `worktreeAdd` as `worktree-add`,
`worktreeRemove` as `worktree-remove`, `worktreePrune` as `worktree-prune`,
`commit` as `commit`, and a `fastForward` that returns `done` as
`fast-forward`. A write that fails, or a `fastForward` that returns
`blocked`, SHALL append nothing. The line SHALL be
`{"at":"<ISO time>","op":"<op>","root":"<tree root>"}` and a newline, where
the root is the project root the `GitVcs` was selected for.

The tree record SHALL be `osq-trees.jsonl` in the directory that
`git rev-parse --git-common-dir` prints, resolved against that root, so a
write from a linked worktree and one from the checkout append to the same
file. The record path SHALL be resolved at most once per `GitVcs`, at its
first recorded write. A failure to resolve or append SHALL be ignored, and
the write SHALL return what it returned before. Nothing in osq SHALL read the
record's contents; watchers only watch it, and deleting it changes nothing
but how soon they notice.

`treeRecordPath(projectRoot, config)` in `src/core/vcs/tree-record.ts`
SHALL return the tree record's absolute path when `vcs.enabled` is true and
git prints the common directory, and null otherwise, without running git
when `vcs.enabled` is not true.

#### Scenario: Worktree add from the checkout
- **WHEN** `worktreeAdd` runs through `selectVcs` on a temporary repository's checkout
- **THEN** `.git/osq-trees.jsonl` holds one line whose `op` is `worktree-add` and whose `root` is the checkout

#### Scenario: Commit in a linked worktree
- **WHEN** `commit` runs through `selectVcs` on a linked worktree of that repository
- **THEN** the checkout's `.git/osq-trees.jsonl` gains one line whose `op` is `commit` and whose `root` is the worktree, and the worktree holds no `osq-trees.jsonl`

#### Scenario: Failed commit records nothing
- **WHEN** a `pre-commit` hook exits 1 and `commit` fails
- **THEN** `.git/osq-trees.jsonl` gains no line

#### Scenario: Unwritable record
- **WHEN** `.git/osq-trees.jsonl` is a directory and `commit` runs
- **THEN** `commit` returns the new commit and HEAD is that commit

#### Scenario: Record path
- **WHEN** `treeRecordPath` runs on each project below
- **THEN** it returns the path in the table

| project | `vcs.enabled` | result |
| --- | --- | --- |
| a temporary repository's checkout | true | `<checkout>/.git/osq-trees.jsonl` |
| a linked worktree of that repository | true | `<checkout>/.git/osq-trees.jsonl` |
| that checkout | false | null |
| a temporary folder outside any repository | true | null |
