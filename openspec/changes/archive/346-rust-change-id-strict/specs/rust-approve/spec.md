## MODIFIED Requirements

### Requirement: Approve lookup
`approve` SHALL approve the first active change folder whose name matches
the query: a folder matches when rust-core `parse_change_id` reads the
query with `slug` false into an id that names the folder, as rust-core
"Change ids" says, and a query it refuses matches no folder. With git off, as "Worktree approval" says, the folders are
rust-storage `list_changes` of the root, in its order. With git on, they are
the active entries of rust-storage `list_tree_changes` over `change_trees`
for the root, built from the `worktree_list` of a `GitVcs` at the root with
the config's `timeouts` and no stacked folders, in that order, so a change
approved into its osq worktree is found there, as TypeScript's
`findSteeringChange` finds it; a failing worktree listing SHALL fail with
the `VcsError`'s display. With no match, `approve` SHALL fail with
`Spec "<query>" not found in <changes>`, where `<query>` is the argument as
given and `<changes>` is the root joined with `openspec/changes`, shown with
`display()`. When `parse_change_id` refuses the query, `approve` and
`reject` SHALL instead fail, at the point they would refuse a query that
matches nothing, with the `ChangeIdError`'s display as the message. Archived and rejected folders never match, so unlike
TypeScript, an archived change that needs steering is not found.

#### Scenario: Approved folder for a query
- **WHEN** `approve` runs with the row's query on a root whose active change folders are `001-alpha`, `012-beta`, `012-beta-two` and `x-y`, and whose archived folder is `003-gamma`, each a valid change folder
- **THEN** it approves the row's folder, writing its `.run/approved`, and no other folder gains one, or it gives the row's `Failed` error, where `<changes>` is the root joined with `openspec/changes`:

| Query | Result |
|---|---|
| `1` | `001-alpha` |
| `001` | `001-alpha` |
| `  1  ` | `001-alpha` |
| `001-alpha` | `001-alpha` |
| `12` | `012-beta` |
| `012-beta-two` | `012-beta-two` |
| `x` | `Spec "x" not found in <changes>` |
| `x-y` | `x-y` |
| `3` | `Spec "3" not found in <changes>` |
| `alpha` | `Spec "alpha" not found in <changes>` |
| `012-beta-t` | `Spec "012-beta-t" not found in <changes>` |
| `1]` | `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `0O1` | `"0O1" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |

#### Scenario: Reject refuses a query that is not a change id
- **WHEN** `reject` runs with the arguments `1]`, `--reason`, `why` on a root whose one active change folder `001-a` holds `proposal.md` and `tasks/1.md`
- **THEN** it gives a `Failed` error for the command `reject` with the message `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name`, and leaves every file in place
