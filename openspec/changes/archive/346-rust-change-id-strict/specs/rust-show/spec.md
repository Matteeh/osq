## MODIFIED Requirements

### Requirement: Show lookup
`show` SHALL find the change as TypeScript's `resolveSpecFolder` does,
except for how an id names a folder.
With `vcs.enabled` and git on, as "Show git state" says, the listing is
the storage kernel's `list_tree_changes` over `change_trees` of the root,
every `worktree_list` entry as a tree candidate, and the folders under
`stacked_root` of the vcs config, the repository root and `HOME`, as the
inbox reads them; otherwise it is `list_changes` of the root. A trimmed id
holding `/` that names a directory, absolute or under the root, is that
folder, archived or rejected by its parent folder. Any other id is the
first change in the listing's order whose folder the id names when
rust-core `parse_change_id` reads it with `slug` true, as rust-core
"Change ids" says. When `parse_change_id` refuses the id, `show` SHALL
fail with `FeatureError::failed("show", ..)` and the `ChangeIdError`'s
display in place of the not-found text of "Show lookup errors".

#### Scenario: Show lookup forms
- **WHEN** a test runs `show` with each argument of "Show text equals TypeScript's" on a scratch copy of the fixture
- **THEN** the output's first line is the golden's first line

#### Scenario: Show lookup edge forms
- **WHEN** a test runs `show` with the row's argument on a scratch root whose one active change folder is the row's folder, holding only a `proposal.md` of `---\ntitle: Edge\n---\n## Goal\n\nGoal.\n`
- **THEN** the output's first line is the row's line, or it gives the `Failed` error for the command `show` with the row's message:

| Argument | Folder | Result |
|---|---|---|
| `0002` | `0002` | line `Spec: 0002 (0002)` |
| `02` | `02-x` | line `Spec: 02-x (02)` |
| `2` | `002-x` | line `Spec: 002-x (002)` |
| `x` | `002-x` | line `Spec: 002-x (002)` |
| `x-alpha` | `x-alpha` | line `Spec: x-alpha (x-alpha)` |
| `alpha` | `x-alpha` | message `Spec "alpha" not found in specs or archive` |
| `002-x-y` | `002-x` | message `Spec "002-x-y" not found in specs or archive` |
| `-2` | `0-2-x` | message `"-2" is not a change id; give the change's number, such as 7 or 007, its full folder name, or that name without its number` |
| `2]` | `002-x` | message `"2]" is not a change id; give the change's number, such as 7 or 007, its full folder name, or that name without its number` |

### Requirement: Show dependency readiness
A dependency of an approved active change SHALL count as met, as
TypeScript's `isDependencyDone` says, when rust-core `parse_change_id`
reads it with `slug` false into an id that names an archived change folder,
or an active change folder whose every task file has a done marker, as
rust-core "Change ids" says. A dependency `parse_change_id` refuses is
never met. A rejected change, a missing one and an active one
without task files never count as met, and an unmet dependency makes the
change `blocked`.

#### Scenario: Dependency readiness from folders
- **WHEN** a test runs `show 1` on a scratch root built as "Status and next step from markers" says, for the row
- **THEN** the output's `Status:` line, `Next:` line and first task line, trimmed, are the row's:

| Row | Status | Next | Task line |
|---|---|---|---|
| depends 002 missing | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 2 archived | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 rejected | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active unfinished | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active done | `Status: [pending]` | `Next: running — osq show 001` | `[ ] 1. When a runs, it works [pending]` |
| depends 002 active no tasks | `Status: [blocked]` | `Next: blocked (waiting for 002) — osq show 002` | `[ ] 1. When a runs, it works [pending]` |
