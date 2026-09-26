## ADDED Requirements

### Requirement: Change locations
<!-- source: src/core/status/change-locations.ts, tests/change-locations.test.ts -->
`src/core/status/change-locations.ts` SHALL be the one place that lists the
trees changes live in and the change folders in them. `changeTrees` SHALL
return each tree with its root and its changes, archive, and rejected
directories. With one tree, that is the project root. `listChanges` SHALL
return directories only, active first, then archived, then rejected, each in
numeric prefix order. An active folder SHALL pass `isActiveChangeFolderName`,
and an archived or rejected one SHALL NOT start with `_` or `.`. Each change
SHALL carry its folder name, absolute path, location, and tree. `findChange`
SHALL match an active change by exact name, by number with or without zero
padding, or by that number followed by `-`, as `findSpecFolder` does, and SHALL
fail with its message when nothing matches. `locateFolder` SHALL return the
change an absolute folder path names, or null. `changesDirLabel` SHALL return
the changes directory relative to the project root, for display.

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
- **WHEN** `changeTrees` runs for a project
- **THEN** it returns exactly one tree, rooted at the project root

### Requirement: Change location readers
<!-- source: tests/change-locations-readers.test.ts -->
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
