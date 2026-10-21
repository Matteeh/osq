## ADDED Requirements

### Requirement: Change trees
`change_trees(project_root: &Path, worktrees: &[TreeCandidate],
stacked: &[PathBuf]) -> Vec<ChangeTree>` in `osq-kernel-storage` SHALL give
the trees as TypeScript's `changeTrees` does: a `ChangeTree` is a `root`
and the `folder` it names. First the project root, naming none. Then each
worktree (`path`, `branch`) on `osq/<folder>`, not at the root's real path,
holding `changes/<folder>/.run/approved` or the folder in `archive/` or
`rejected/`. Then each `stacked` folder no worktree names.

#### Scenario: Trees of a project
- **WHEN** `change_trees` reads a project root and the row's worktrees, under a new folder in `CARGO_TARGET_TMPDIR`, with no stacked folders
- **THEN** it returns the project root, then the row's trees:

| Worktree | Branch | Holds | Trees after the root |
|---|---|---|---|
| `wt-a` | `osq/002-b` | `openspec/changes/002-b/.run/approved` | `wt-a` naming `002-b` |
| `wt-a` | `osq/002-b` | `openspec/changes/archive/002-b/` | `wt-a` naming `002-b` |
| `wt-a` | `osq/002-b` | `openspec/changes/002-b/` with no `.run/approved` | none |
| `wt-a` | `main` | `openspec/changes/002-b/.run/approved` | none |
| the project root itself | `osq/002-b` | `openspec/changes/002-b/.run/approved` | none |

#### Scenario: Stacked trees
- **WHEN** `change_trees` reads a project root, a worktree `wt-a` on `osq/002-b` holding an approved `002-b`, and the stacked folders `.stacked/002-b` and `.stacked/003-c`
- **THEN** it returns the project root, `wt-a` naming `002-b`, and `.stacked/003-c` naming `003-c`

### Requirement: Change listing across trees
`list_tree_changes(trees: &[ChangeTree]) -> Vec<ChangeEntry>` SHALL list
every tree's change folders as `list_changes` reads a root, as TypeScript's
`listChanges` does. A tree naming a folder gives only that folder, minus an
archived or rejected entry the first tree also holds there. The first tree
drops an active folder another tree names. Entries sort by location, then
leading number, ties in tree order, and each `path` is in its own tree.

#### Scenario: Changes across trees
- **WHEN** `list_tree_changes` reads the project root holding active `001-a` and `002-b` and archived `000-z`, then a tree naming `002-b` that holds active `002-b` and archived `000-z`, then a tree naming `003-c` that holds archived `003-c`
- **THEN** it returns active `001-a` from the root, active `002-b` from the second tree, archived `000-z` from the root, and archived `003-c` from the third tree, in that order

#### Scenario: Root alone
- **WHEN** `list_tree_changes` reads only the project root tree
- **THEN** it returns what `list_changes` returns for that root
