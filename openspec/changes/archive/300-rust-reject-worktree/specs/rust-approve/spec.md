## ADDED Requirements

### Requirement: Worktree rejection
After it checks its arguments and before it reads any change, `reject`
SHALL read `osq.toml` with rust-config `load_config`, failing with the
`ConfigError`'s display when it cannot. Git is on as "Worktree approval"
says. With git off, `reject` SHALL find and reject the change as the other
reject requirements say. With git on, it SHALL instead match the query, as
"Approve lookup" matches it, against the active changes of rust-storage
`list_tree_changes` of rust-storage `change_trees` of the root, with one
candidate per entry of rust-vcs `worktree_list` of a `GitVcs` at the root
with the config's `timeouts`, and no stacked folders, in that order. A git
error fails with its display. The change sits in the tree whose root its
path starts with, and that tree's root is the root every other reject
requirement names: the destination, its refusal text, the move and the
record use it.

When the change sits in an osq worktree, `reject` SHALL, after the record
is written, finish the rejection as TypeScript's `commitRejectedWorktree`
in `src/core/lifecycle/reject-vcs.ts` does, with a `GitVcs` at the tree's
root with the config's `timeouts`. `<tree>` is the folder that `GitVcs`'s
rust-vcs `root` gives, or the tree's root when it gives none.

1. It takes every `path` and every `from` of rust-vcs `status` that equals,
   or lies under, the change folder's old path or its rejected path, each
   relative to `<tree>` with `/`, sorted and without repeats, and commits
   them with rust-vcs `commit`, the author `vcs.author` and the message
   made of these lines, each followed by a newline: `osq: <id> rejected`,
   an empty line, the trimmed reason, `rejected to <rejected path>`, an
   empty line and `Osq-Change: <folder>`, `<rejected path>` relative to
   `<tree>` with `/`.
2. When `status` again lists a `path` or `from` outside those two folders,
   it keeps the worktree because `the worktree has other changes`.
3. Otherwise it removes the worktree with rust-vcs `worktree_remove` of
   `<tree>`.

A `VcsError` at any step keeps the worktree, and its display is the
reason. Unlike TypeScript, which throws when the second `status` fails,
Rust keeps the worktree with that error's display too. The branch
`osq/<folder>` is always kept.

The output of a worktree rejection SHALL be `Rejected <id> (<folder>)`,
`  Reason: <reason>`, then `  Worktree removed: <tree>`, or
`  Worktree kept: <tree> (<why>)` with the reason it was kept, then
`  Branch kept: osq/<folder>`, each followed by a newline. A change in the
root, with git on or off, is rejected with no git call after the lookup,
and its output stays as "Rejection record" says.

#### Scenario: Worktree rejections equal TypeScript's
- **WHEN** a test builds the scratch repository `openspec/changes/300-rust-reject-worktree/golden/print-reject-worktree-goldens.mjs.txt` describes for the row's case, from `tests/fixtures/reject-worktree`, a copy of `openspec/changes/300-rust-reject-worktree/fixture/reject-worktree/`, and runs `reject` with the row's id, `--reason` and `why` on `<scratch>/repo`
- **THEN** its `out:` lines, its `error:` message displayed after `reject failed: `, and its `branches:`, `worktrees:`, `tip:`, `commit:` and `status:` lines, built as the script builds them with the scratch folder written `<scratch>`, equal the row's golden in `tests/fixtures/reject-worktree-golden/`, a copy of `openspec/changes/300-rust-reject-worktree/golden/`, except that a `Worktree kept:` line whose row gives a phrase starts with `  Worktree kept: <scratch>/trees/001-alpha (` and holds the phrase, and the golden's line or lines for that why are not compared:

| Case | Id | Golden | Phrase |
|---|---|---|---|
| `removed` | `1` | `removed-001.txt` | none |
| `other-changes` | `1` | `other-changes-001.txt` | none |
| `hook-fails` | `1` | `hook-fails-001.txt` | `refused by hook` |
| `locked` | `1` | `locked-001.txt` | `cannot remove a locked working tree` |
| `healthy` | `2` | `healthy-002.txt` | none |
| `root` | `3` | `root-003.txt` | none |

#### Scenario: Reject config that does not load
- **WHEN** a test runs `reject` with the arguments `1`, `--reason`, `why` on the "Reject outcomes" root with no other files, whose `osq.toml` holds `[vcs]` and `enabled = true`, each followed by a newline
- **THEN** it gives a `Failed` error displayed `reject failed: ` followed by the display of the error rust-config `load_config` gives for that root, and `openspec/changes/001-a` is still in place with no `.run/` folder
