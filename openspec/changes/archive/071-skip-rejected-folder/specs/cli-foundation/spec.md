# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Active change folder entries
<!-- source: src/core/status/layout.ts, src/watcher/loop.ts, src/cli/lint.ts -->
`isActiveChangeFolderName` in `src/core/status/layout.ts` SHALL decide which
changes directory entries are active change folders: every name except those
starting with `_` or `.` and the archive and rejected folders. The watcher cycle
and bare `osq lint` SHALL list change folders through it.

#### Scenario: Watcher skips the rejected folder
- **WHEN** the watcher runs a cycle and the changes directory holds `archive` and `rejected` beside an approved change
- **THEN** it logs no watcher error for either folder and runs the approved change's task

#### Scenario: Bare lint skips the rejected folder
- **WHEN** `osq lint` runs without ids and the changes directory holds `rejected` beside a valid change
- **THEN** it lints only the valid change, reports no finding that names `rejected`, and exits 0
