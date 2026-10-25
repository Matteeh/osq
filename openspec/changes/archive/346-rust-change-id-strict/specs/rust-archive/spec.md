## MODIFIED Requirements

### Requirement: Change lookup
`archive` SHALL first read the root's config with rust-config
`load_config`, failing with the config error's display. The one argument of
`archive` SHALL name the change: the first active change folder that
rust-core `parse_change_id` reads the argument, with `slug` false, into an
id naming, as rust-core "Change ids" says; an argument it refuses names no
folder. With
`vcs.enabled` off, the folders are rust-storage `list_changes` of the root,
in its order, so only folders directly under `<root>/openspec/changes/`.
With it on, they are rust-storage `list_tree_changes` of rust-storage
`change_trees` of the root, in its order, with one candidate per entry of
rust-vcs `worktree_list` of a `GitVcs` at the root with the config's
`timeouts`, and no stacked folders; a git error fails with its display.
With no such folder, `archive` SHALL fail with `no active change <argument>`,
or, when `parse_change_id` refuses the argument, with the
`ChangeIdError`'s display.

The change sits in the tree whose root its path starts with. That tree's
root is the `<root>` every other archive requirement names: the merge, the
living files, the record's paths, the move and the output use it.

#### Scenario: Change named by id or folder
- **WHEN** a test runs `archive` with the argument in the row, each on its own fresh scratch copy of `tests/fixtures/project`
- **THEN** it gives the row's result; a row that fails leaves the copy's files and folders the fixture's, byte for byte, and a row that gives an `Output` leaves no `openspec/specs/beta`:

| Argument | Result |
|---|---|
| `007` | an `Output` |
| `007-sample` | an `Output` |
| `008` | `Failed` error displayed `archive failed: no active change 008` |
| `007-other` | `Failed` error displayed `archive failed: no active change 007-other` |

#### Scenario: Change ids archive reads
- **WHEN** a test runs `archive` with the argument in the row, each on its own fresh scratch copy of `tests/fixtures/project`
- **THEN** it gives the row's result; a row that fails leaves the copy's files and folders the fixture's, byte for byte:

| Argument | Result |
|---|---|
| `7` | an `Output` |
| `  007  ` | an `Output` |
| `07-sample` | `Failed` error displayed `archive failed: no active change 07-sample` |
| `007]` | `Failed` error displayed `archive failed: "007]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
