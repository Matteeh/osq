## MODIFIED Requirements

### Requirement: Archive replay
`read_archive(project_root)` SHALL read every archived change in listing
order and fail on the first it cannot read. Outside 003 to 013, which only
have to read, a task SHALL fold to `Done` exactly when its `.run/done/<n>`
marker exists. 003 has no `.run/events/`, and 004 to 013 have no `done`
events. The archive replay is a corpus test in `tests/archive_corpus.rs`.

#### Scenario: Fixture archive reads
- **WHEN** `read_archive` reads the fixture project
- **THEN** it returns the snapshots of `001-alpha`, `002-plain` and `010-late`, in that order, each with the status `Archived`

#### Scenario: Archived changes replay
- **WHEN** `read_archive` reads this repository's `openspec/changes/archive/`
- **THEN** it reads at least 200 changes without an error, every task of every change except 003 to 013 folds to `Done` exactly when its done marker exists, and every change numbered 038 or higher holds an `archived` event in `change.jsonl`
