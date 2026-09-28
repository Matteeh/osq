## MODIFIED Requirements

### Requirement: Change locations
<!-- source: src/core/status/change-locations.ts, src/core/status/landed-copies.ts, tests/change-locations.test.ts, tests/change-locations-worktrees.test.ts, tests/change-locations-stacked.test.ts, tests/change-locations-holds.test.ts, tests/change-locations-landed.test.ts -->
`src/core/status/change-locations.ts` SHALL be the one place that lists the
trees changes live in and the change folders in them. `changeTrees` SHALL
return each tree with its root and its changes, archive, and rejected
directories. The first tree SHALL be the project root. With `vcs.enabled` and
`GitVcs` selected, one tree SHALL follow for each worktree from `worktreeList`
whose branch starts with `osq/`, whose path is not the project root, and
which holds its change, and that tree SHALL carry `worktreeFolder`, the
branch name without `osq/`. A worktree holds its change `<folder>` when its
changes directory holds `<folder>/.run/approved`, or its archive or rejected
directory holds `<folder>`. A worktree that does not hold its change SHALL
get no tree, and SHALL hide neither the checkout's copy of the folder nor a
stacked tree of it. After
them, one tree SHALL follow for each directory directly under the stacked
approval directory `<vcs.worktreeRoot>/<repo>/.stacked/`, rooted at that
directory and carrying `stackedFolder`, the directory's name, unless a
worktree tree already names that folder. Otherwise the project root SHALL be
the only tree. A worktree or stacked tree SHALL contribute only the change
folder its `worktreeFolder` or `stackedFolder` names, and the project root
SHALL NOT report an active folder that a worktree or stacked tree names.
When the project root holds an archived or rejected folder, a worktree or
stacked tree SHALL NOT report the folder of the same name in the same
location, because the checkout's copy is the landed one. An active folder
still comes from the worktree or stacked tree that names it.
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

#### Scenario: Stacked change
- **WHEN** `vcs.enabled` is on, the checkout has active `002-b`, and `<vcs.worktreeRoot>/<repo>/.stacked/002-b` holds active `002-b` with `.run/approved`
- **THEN** `changeTrees` ends with a tree rooted at that directory whose `stackedFolder` is `002-b` and which has no `worktreeFolder`, and `listChanges` and `findChange` for `2` return `002-b` from that tree only

#### Scenario: Stacked folder with a worktree
- **WHEN** a stacked directory `002-b` exists and a worktree on `osq/002-b` holds `002-b` with `.run/approved`
- **THEN** `changeTrees` returns no stacked tree for `002-b`, and `listChanges` returns `002-b` from the worktree only

#### Scenario: Worktree without its change
- **WHEN** a stacked directory `002-b` exists and a worktree on `osq/002-b` holds no `002-b` in its changes, archive, or rejected directory
- **THEN** `changeTrees` returns no tree for that worktree and ends with the stacked tree for `002-b`, and `findChange` for `2` returns `002-b` from the stacked tree

#### Scenario: Worktree with an unapproved copy
- **WHEN** a worktree on `osq/002-b` holds `002-b` in its changes directory without `.run/approved`, and the checkout has active `002-b`
- **THEN** `changeTrees` returns no tree for that worktree, and `listChanges` returns `002-b` from the checkout

#### Scenario: Archived or rejected in its worktree
- **WHEN** a worktree on `osq/001-a` holds `001-a` only in its archive directory, and another on `osq/003-c` holds `003-c` only in its rejected directory
- **THEN** `changeTrees` returns a tree for each, and `listChanges` returns `001-a` as archived and `003-c` as rejected from those trees

#### Scenario: Stacked directory with the flag off
- **WHEN** `vcs.enabled` is off and a stacked directory exists
- **THEN** `changeTrees` returns exactly one tree

#### Scenario: Landed with its worktree kept
- **WHEN** `vcs.enabled` is on, the checkout's archive holds `001-a` after a hand landing, and the kept worktree on `osq/001-a` also holds `001-a` in its archive
- **THEN** `changeTrees` still returns the worktree's tree, and `listChanges` returns `001-a` once, as archived, from the checkout

#### Scenario: Rejected in both
- **WHEN** the checkout's rejected directory and a kept worktree on `osq/003-c` both hold `003-c`
- **THEN** `listChanges` returns `003-c` once, as rejected, from the checkout

### Requirement: Change location readers
<!-- source: tests/change-locations-readers.test.ts, tests/change-locations-landed.test.ts -->
The watcher loop, the baseline search, status and its next step, inbox, show,
the queue and its report detail, report and recent disclosures, the web data
and events, doctor and its price check, and the lifecycle commands `approve`,
`retry`, `reject`, `done`, and `verified` SHALL find change folders through
the change locations module. Outside it, only `layout.ts`, `foundation/new.ts`,
`spec/migrate.ts`, `spec/linter.ts`, `cli/lint.ts`, `cli/plan.ts`, and
`watcher/archiver.ts` SHALL call `getChangesDir` or `getArchiveDir`.

#### Scenario: A reader lists changes on its own
- **WHEN** any other file under `src/` calls `getChangesDir` or `getArchiveDir`
- **THEN** the structural test fails and names the file

#### Scenario: Landed change counted once
- **WHEN** a change archived in its worktree has been squashed onto the default branch by hand and committed, and the worktree is kept
- **THEN** `osq queue` shows its item as landed without an ambiguity error, and `osq status`, bare `osq --json`, `osq inbox --json`, and `osq report --json` each count the change once
