## MODIFIED Requirements

### Requirement: Change lookup
`archive` SHALL first read the root's config with rust-config
`load_config`, failing with the config error's display. The one argument of
`archive` SHALL name the change: the first active change folder whose
folder name equals the argument or whose leading digits equal it. With
`vcs.enabled` off, the folders are rust-storage `list_changes` of the root,
in its order, so only folders directly under `<root>/openspec/changes/`.
With it on, they are rust-storage `list_tree_changes` of rust-storage
`change_trees` of the root, in its order, with one candidate per entry of
rust-vcs `worktree_list` of a `GitVcs` at the root with the config's
`timeouts`, and no stacked folders; a git error fails with its display.
With no such folder, `archive` SHALL fail with `no active change <argument>`.

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

## ADDED Requirements

### Requirement: Worktree archive
With `vcs.enabled` on and a change that sits in a tree naming its folder,
`archive` SHALL, after the move and the ticked task lines, commit the
archive in that tree as TypeScript's `commitWorktreeArchive` does. With a
`GitVcs` at the tree's root with the config's `timeouts`, it takes every
`path` and every `from` of rust-vcs `status` that equals, or lies under, the
change folder's old path, `openspec/changes/archive` or `openspec/specs`,
each relative to the tree's root with `/`, sorted and without repeats, and
commits them with rust-vcs `commit`, the author `vcs.author`, and the
message made of these lines, each followed by a newline:

- `osq: <id> archived`
- an empty line
- the change's rust-storage `read_change` `title`, or an empty line when it has none
- `archived to <archive path>`
- an empty line
- `Osq-Change: <folder>`

`<id>` is the folder's leading digits, or the whole folder name when it
has none, and `<archive path>` the archived folder's path relative to the
tree's root with `/`. The `Output` text SHALL then be
`<archive path> on osq/<folder>`.

When the commit fails, `archive` SHALL leave the archived folder and the
living specs as they are and fail with
`osq could not commit the archive of <folder>: <error>`, `<error>` being
the `VcsError`'s display. A change in the project root, with vcs on or
off, SHALL be archived with no git call after the lookup, and its `Output`
text stays the archived folder's path.

#### Scenario: Worktree archive equals TypeScript's
- **WHEN** a test builds the scratch repository `openspec/changes/295-rust-archive-worktree/golden/print-archive-worktree-goldens.mjs.txt` describes for the row's case, from `tests/fixtures/project`, and runs `archive` with the argument `007` on `<scratch>/repo`
- **THEN** it gives an `Output` with the row's text, and the row's tree gives, after `name: ` and the archived folder's name, the same `tip:`, `commit:` and `status:` lines as the row's golden in `tests/fixtures/worktree-golden/`, a copy of `openspec/changes/295-rust-archive-worktree/golden/`; for the `worktree` case, the files under the tree's `openspec/` are also exactly the files under `tests/golden/project/openspec/`, each byte for byte:

| Case | Tree | Output text | Golden |
|---|---|---|---|
| `worktree` | `<scratch>/trees/007-sample` on `osq/007-sample` | `openspec/changes/archive/007-sample on osq/007-sample` | `worktree-007.txt` |
| `taken` | `<scratch>/trees/007-sample` on `osq/007-sample` | `openspec/changes/archive/007-sample-1 on osq/007-sample` | `taken-007.txt` |
| `root` | `<scratch>/repo` on `main` | `openspec/changes/archive/007-sample` | `root-007.txt` |

#### Scenario: Worktree archive commit fails
- **WHEN** a test builds the scratch repository of the `hook-fails` case, whose `pre-commit` hook prints `refused by hook` and exits 1, and runs `archive` with the argument `007` on `<scratch>/repo`
- **THEN** it gives a `Failed` error whose display starts with `archive failed: osq could not commit the archive of 007-sample: ` and contains `refused by hook`, and `<scratch>/trees/007-sample` on `osq/007-sample` gives the same `name:`, `tip:`, `commit:` and `status:` lines as `hook-fails-007.txt` in `tests/fixtures/worktree-golden/`

#### Scenario: Config that does not load
- **WHEN** a test writes `osq.toml` holding `[vcs]`, `enabled = true`, each followed by a newline, to a fresh scratch copy of `tests/fixtures/project`, and runs `archive` with the argument `007`
- **THEN** it gives a `Failed` error displayed `archive failed: ` followed by the display of the error rust-config `load_config` gives for that copy, and every other file and folder of the copy is the fixture's, byte for byte
