## ADDED Requirements

### Requirement: Branch deletion
The `Vcs` trait SHALL hold `delete_branch(name)`, taking `&self` and
returning `Result<(), VcsError>`, and `GitVcs` SHALL implement it through
"Git command" as `branch -d <name>`: `Ok(())` when git deletes the branch,
and `VcsError::Failed` when git refuses, as it does for a missing branch,
a branch a worktree has checked out, or a branch whose commits HEAD does
not hold. It SHALL never pass `-D` or `--force`, so no commit is ever
lost (ADR 003). TypeScript's `GitVcs` has no such write; Rust approve uses
it to roll back a branch it created that holds no commit of its own.

#### Scenario: Branch deletions
- **WHEN** `delete_branch` runs with the row's name on a repository made with `git init -b main`, holding a commit `base` with `a.txt` (`one\n`), a branch `osq/merged` at `base`, a branch `osq/ahead` one commit past `base` changing `a.txt` to `two\n`, and a branch `osq/busy` at `base` checked out in the worktree beside the repository named after it plus `-busy`
- **THEN** it gives the row's answer, and the branches are then as the row says:

| Name | Answer | Branches after |
|---|---|---|
| `osq/merged` | `Ok(())` | `osq/merged` is gone |
| `osq/ahead` | `VcsError::Failed` | `osq/ahead` still points at its commit |
| `osq/busy` | `VcsError::Failed` | `osq/busy` still exists |
| `osq/missing` | `VcsError::Failed` | unchanged |

### Requirement: Tree record
`GitVcs` SHALL have `tree_record_path(&self)`, returning
`Result<Option<PathBuf>, VcsError>`: the directory `rev-parse
--git-common-dir` prints in its root, resolved against that root when
relative, joined with `osq-trees.jsonl`, or none when git refuses or
prints nothing, and `VcsError::Spawn` when git cannot start, as
TypeScript's `resolveTreeRecordPath` in `src/core/vcs/tree-record.ts`
gives it. The crate SHALL export `append_tree_record(path, at, op, root)`,
with `path` and `root` as `&Path` and `at` and `op` as `&str`, which
appends one line to `path`: the JSON object with the keys `at`, `op` and
`root` in that order, `root` written with `display()`, and a newline,
exactly as TypeScript's `appendTreeRecord` writes it with `JSON.stringify`
for the same values. It SHALL ignore every failure to open or write the
file, as TypeScript does.

#### Scenario: Tree record path and lines
- **WHEN** a test reads `tree_record_path` in the row's folder and then calls `append_tree_record` twice on the path it gives, with `at` `2026-10-22T10:00:00.000Z`, the ops `worktree-add` and `commit`, and the roots `/r/repo` and `/r/wt "x"`
- **THEN** the path is the row's, and the file then holds `{"at":"2026-10-22T10:00:00.000Z","op":"worktree-add","root":"/r/repo"}\n{"at":"2026-10-22T10:00:00.000Z","op":"commit","root":"/r/wt \"x\""}\n`, written with `\n` escapes:

| Folder | Path |
|---|---|
| a repository made with `git init -b main` | its canonical directory joined with `.git/osq-trees.jsonl` |
| a worktree of that repository, added for a new branch | the same path |

#### Scenario: Tree record without git
- **WHEN** `tree_record_path` runs in a folder git does not know as a repository, with `GIT_CEILING_DIRECTORIES` set to that folder's parent through `GitVcs::with_env`, and `append_tree_record` runs with a path inside a folder that does not exist
- **THEN** the path is none, and the append returns without a panic and creates no file
