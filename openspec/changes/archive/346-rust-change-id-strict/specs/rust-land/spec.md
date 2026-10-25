## MODIFIED Requirements

### Requirement: Land lookup
`land` SHALL find the change in the osq worktrees as TypeScript's
`changeTrees` and `buildSquashMessage` find it. Each entry of the root's
`worktree_list`, in its order, whose branch is `osq/<x>`, whose
canonical path is not the root's canonical path, and whose path holds the
directory `openspec/changes/<x>` or `openspec/changes/archive/<x>`, is
the worktree of change `<x>`. A folder matches the query when rust-core
`parse_change_id` reads the query with `slug` false into an id that names
the folder, as rust-core "Change ids" says; a query it refuses matches no
folder. For `land`, `sync` and `message`, when the query is refused, the
failure each gives for a query that matches no change SHALL instead have
the `ChangeIdError`'s display as its message.

The change SHALL be the first worktree change matching the query whose
worktree holds `openspec/changes/archive/<x>`, or else the first folder of
the root's rust-storage `list_changes` whose location is archived and
which matches the query. When the default branch holds the path
`openspec/changes/archive/<folder>`, as the vcs kernel's `path_exists`
reads it, the change has landed. `land` SHALL then make no commit and,
after the checks of "Land refusals" that apply to a landed change, run
"Land cleanup" and then "Land after-land retry", which writes only the
after-land record and what its command writes. Its landed lines are
`<folder> has already landed` and a newline followed by the cleanup's line
and a newline when "Land cleanup" attempted a removal, or
`<folder> has already landed; nothing to clean up` and a newline when it
did not. Without a retry, `land` SHALL return the landed lines as its
output, or, when the cleanup failed, fail with `FeatureError::failed` with
the command `land` and those lines without the last newline as the
message.

Otherwise `land` SHALL fail, writing nothing, in this order: with
`<x> has not archived on osq/<x>` for the first worktree change matching
the query whose worktree holds `openspec/changes/<x>`; and with
`No archived change "<query>" in an osq worktree`, with the query as
given, when no worktree change matching the query has an archived folder.
The change's archived folder is then `openspec/changes/archive/<folder>`
in its worktree.

#### Scenario: Change for a query
- **WHEN** `land` runs with the row's query on a land repository holding the row's changes, each a worktree change unless the row says otherwise
- **THEN** it gives the row's result, where `Landed` means the output begins `Landed <folder> as `, and a `Failed` result leaves `main` where it was:

| Changes | Query | Result |
|---|---|---|
| the fixture change | `1` | `Landed 001-alpha-orders` |
| the fixture change | `001` | `Landed 001-alpha-orders` |
| the fixture change | `  1  ` | `Landed 001-alpha-orders` |
| the fixture change | `001-alpha-orders` | `Landed 001-alpha-orders` |
| the fixture change | `001-alpha` | `Failed` with `No archived change "001-alpha" in an osq worktree` |
| the fixture change | `001-alpha-orders-x` | `Failed` with `No archived change "001-alpha-orders-x" in an osq worktree` |
| the fixture change | `1x` | `Failed` with `No archived change "1x" in an osq worktree` |
| the fixture change | `1]` | `Failed` with `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| the fixture change | `2` | `Failed` with `No archived change "2" in an osq worktree` |
| the fixture change | `alpha` | `Failed` with `No archived change "alpha" in an osq worktree` |
| `001-alpha-orders`, whose worktree holds it under `openspec/changes/001-alpha-orders` and not under the archive | `1` | `Failed` with `001-alpha-orders has not archived on osq/001-alpha-orders` |
| the fixture change, with its worktree's branch renamed to `work/001-alpha-orders` | `1` | `Failed` with `No archived change "1" in an osq worktree` |

#### Scenario: Already landed
- **WHEN** `land` runs with the query `1` on a land repository holding the fixture change after `main` gained a commit that adds `openspec/changes/archive/001-alpha-orders/proposal.md`, with the row's worktrees
- **THEN** it gives the row's output, written with `\n` escapes, and `main` gains no commit:

| Worktrees | Output |
|---|---|
| the fixture change's worktree remains at its "Land cleanup" path `<path>`, under a `vcs.worktreeRoot` set in `osq.toml` | `001-alpha-orders has already landed\nRemoved worktree <path>\n` |
| the fixture change's worktree was removed with `git worktree remove --force`, and the checkout holds `openspec/changes/archive/001-alpha-orders/proposal.md` | `001-alpha-orders has already landed; nothing to clean up\n` |

#### Scenario: Sync and message refuse a query that is not a change id
- **WHEN** the row's command runs with the row's query on a land repository holding the fixture change
- **THEN** it gives a `Failed` error for the row's command with the row's message, and `main` and the change's branch stay where they were:

| Command | Query | Message |
|---|---|---|
| `sync` | `1]` | `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `sync` | `001-alpha` | `No change "001-alpha" runs in an osq worktree` |
| `message` | `1]` | `"1]" is not a change id; give the change's number, such as 7 or 007, or its full folder name` |
| `message` | `001-alpha` | `No archived change "001-alpha" in an osq worktree` |
