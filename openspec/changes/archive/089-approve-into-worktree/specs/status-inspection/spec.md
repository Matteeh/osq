## MODIFIED Requirements

### Requirement: Change locations
<!-- source: src/core/status/change-locations.ts, tests/change-locations.test.ts, tests/change-locations-worktrees.test.ts -->
`src/core/status/change-locations.ts` SHALL be the one place that lists the
trees changes live in and the change folders in them. `changeTrees` SHALL
return each tree with its root and its changes, archive, and rejected
directories. The first tree SHALL be the project root. With `vcs.enabled` and
`GitVcs` selected, one tree SHALL follow for each worktree from `worktreeList`
whose branch starts with `osq/` and whose path is not the project root, and
that tree SHALL carry `worktreeFolder`, the branch name without `osq/`.
Otherwise the project root SHALL be the only tree. A worktree tree SHALL
contribute only the change folder its `worktreeFolder` names, and the project
root SHALL NOT report an active folder that a worktree tree names.
`listChanges` SHALL return directories only, active first, then archived, then
rejected, each in numeric prefix order. An active folder SHALL pass
`isActiveChangeFolderName`, and an archived or rejected one SHALL NOT start
with `_` or `.`. Each change SHALL carry its folder name, absolute path,
location, and tree. `findChange` SHALL match an active change by exact name, by
number with or without zero padding, or by that number followed by `-`, as
`findSpecFolder` does, and SHALL fail with its message when nothing matches.
`locateFolder` SHALL return the change an absolute folder path names, or null.
`changesDirLabel` SHALL return the changes directory relative to the project
root, for display.

#### Scenario: Order and filters
- **WHEN** a project has active `010-b` and `002-a`, a file `notes.md` and a folder `_scratch` in `changes/`, archived `001-x`, and rejected `003-y`
- **THEN** `listChanges` returns `002-a`, `010-b`, `001-x`, and `003-y` in that order, with locations active, active, archived, and rejected

#### Scenario: Lookup by number
- **WHEN** `findChange` is asked for `7` and the active change `007-seven` exists
- **THEN** it returns `007-seven`

#### Scenario: Lookup miss
- **WHEN** `findChange` is asked for `9` and no active change matches
- **THEN** it fails with `Spec "9" not found in <changesDir>`

#### Scenario: Locate an archived folder
- **WHEN** `locateFolder` is given the absolute path of `archive/001-x`
- **THEN** it returns that change with location `archived`

#### Scenario: One tree today
- **WHEN** `changeTrees` runs for a project with `vcs.enabled` off
- **THEN** it returns exactly one tree, rooted at the project root

#### Scenario: Running change in a worktree
- **WHEN** `vcs.enabled` is on, the checkout has active `001-a` and `002-b`, and a worktree on `osq/001-a` holds active `001-a` and `002-b`
- **THEN** `listChanges` returns `001-a` from the worktree and `002-b` from the checkout, and `findChange` for `1` returns the worktree's `001-a`

#### Scenario: Worktree of another branch
- **WHEN** `vcs.enabled` is on and a worktree is on a branch not starting with `osq/`
- **THEN** `changeTrees` returns no tree for it

## ADDED Requirements

### Requirement: Running change in status
<!-- source: src/core/status/status.ts, tests/status-worktree.test.ts -->
`osq status` SHALL print `  worktree: <path>` under a change that runs in a
worktree, directly below its heading line. When the checkout still holds a
folder of the same name whose authored-content hash differs from the
worktree's `.run/approved`, it SHALL print, below the worktree line,
`  warning: the checkout's copy of <folder> changed since approval; edits there never reach the run`.
A checkout copy that matches, or is missing, SHALL print no warning.

#### Scenario: Worktree path
- **WHEN** `osq status` runs with `vcs.enabled` and a change approved into a worktree
- **THEN** the change is listed once, as approved, followed by `  worktree: ` and the worktree path

#### Scenario: Edited checkout copy
- **WHEN** a task file in the checkout's copy of that change is edited after approval
- **THEN** status prints the checkout copy warning naming the folder

#### Scenario: Untouched checkout copy
- **WHEN** the checkout's copy is unchanged since approval
- **THEN** status prints no warning
