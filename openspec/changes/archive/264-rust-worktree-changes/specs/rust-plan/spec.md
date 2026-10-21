## MODIFIED Requirements

### Requirement: Next change number
The new change folder SHALL be named `<number>-<slug>`, with the chosen
item's slug, under `<root>/openspec/changes/`. Its number SHALL be one more
than the highest value of the leading digits of any entry name, file or
folder, directly in `openspec/changes/`, `openspec/changes/archive/` or
`openspec/changes/rejected/`, or 1 when there is none, written in decimal
and padded with leading zeros to three digits, as TypeScript's
`nextChangeNumber` gives it for the checkout's folders. The change id is
that number's text.

When `load_config(<root>)` gives `vcs.enabled` true, the highest value SHALL
also count, as TypeScript's `knownChangeFolders` does, the leading digits of
every folder `list_tree_changes` lists for `change_trees` of the root, the
worktrees `worktree_list` gives and the folders under `stacked_root` of
`vcs.root()`, or of the root when git gives none, with the `HOME` variable as
the home, and of every branch `list_branches("osq/")` gives, after `osq/`.
Each git command runs through a `GitVcs` on the root carrying the config's
`timeouts`. A config or git error SHALL fail `plan` with its display and
create no folder. With `vcs.enabled` false, `plan` reads no git.

#### Scenario: Next change numbers
- **WHEN** `plan` runs with the args `--next` on a root whose `openspec/queue.md` holds `## [a] A\n\nDepends on: nothing\n\nA.\n`, written with `\n` escapes, and the row's entries, none of which holds a `brief.md`
- **THEN** the root's `openspec/changes/` holds the row's new folder:

| Entries | New folder |
|---|---|
| no `openspec/changes/` folder | `001-a` |
| active `007-x`, archived `012-y` and rejected `030-z` folders | `031-a` |
| active `x-y` folder | `001-a` |
| active `0999-x` folder | `1000-a` |
| file `openspec/changes/041-notes.md` | `042-a` |

#### Scenario: Next change number across worktrees
- **WHEN** `plan` runs with the args `--next` on a scratch git repository whose `osq.toml` sets `vcs.enabled = true` and `vcs.worktreeRoot` to a scratch folder, whose checkout holds active `007-x` and whose `openspec/queue.md` holds item `a`, with a real worktree on branch `osq/012-y` holding `openspec/changes/012-y/.run/approved`, and a branch `osq/020-z` with no worktree
- **THEN** the checkout's `openspec/changes/` holds the new folder `021-a`

#### Scenario: Next change number with vcs off
- **WHEN** the same repository's `osq.toml` sets `vcs.enabled = false`
- **THEN** the new folder is `008-a`
