# rust-storage Specification

## Purpose
The storage kernel of the Rust rewrite of osq: it reads a project's change
folders, `.run` markers and event files as they are on disk into typed
snapshots, folding events with rust-core, and builds the SQLite read model
features read through. The files are the truth; the database is a cache that
can be deleted and rebuilt.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/storage/** -->
The rust-storage capability SHALL own the `osq-kernel-storage` crate: its
manifest, its source, its tests and their fixtures.

#### Scenario: Storage crate ownership
- **WHEN** file ownership is resolved for the change listing, the snapshot reader or the read model
- **THEN** system maps `crates/kernel/storage/**` to rust-storage

### Requirement: Change listing
`list_changes(project_root)` SHALL return every change folder under
`openspec/changes/`: active folders directly in it, then `archive/`, then
`rejected/`, each with its `Location`. Only directories count, a name starting
with `_` or `.` never does, and `archive` and `rejected` are not active
changes. Within a location, folders sort by their leading number, then by name.

#### Scenario: Fixture project listing
- **WHEN** `list_changes` reads `crates/kernel/storage/tests/fixtures/project`
- **THEN** it returns exactly these entries, in this order:

| Folder | Location |
|---|---|
| `003-beta` | active |
| `001-alpha` | archived |
| `002-plain` | archived |
| `010-late` | archived |
| `004-gamma` | rejected |

#### Scenario: Missing changes folder
- **WHEN** `list_changes` reads a project with no `openspec/changes/` folder
- **THEN** it returns no entries and no error

### Requirement: Change snapshot
`read_change(entry)` SHALL read one change folder into a `ChangeSnapshot`:
its id (the folder's leading digits), folder and location; its proposal
title and `## Goal` text; its planner; its `approved` marker, `approvedAt`
and archive time; its task files with titles, `done/<n>` markers and started
counts; the `ChangeState` folded with `apply` over its event files; its
`ChangeStatus`; and the facts the read model tables need.

#### Scenario: Archived change snapshot
- **WHEN** `read_change` reads the fixture change `001-alpha`
- **THEN** the snapshot holds:

| Field | Value |
|---|---|
| id | `001` |
| title | `Alpha` |
| goal | `Ship alpha.` |
| planner | `opus` |
| approved | true |
| task ids, in order | `1`, `2`, `10` |
| task titles | `When one, first`, `When two, second`, `When ten, tenth` |
| done markers | `1`, `2` |
| started counts | `1`: 1, `2`: 2, `10`: 0 |
| folded task statuses | `1`: `Done`, `2`: `Done`, `10`: `Pending` |
| change record | archived at `openspec/changes/archive/001-alpha` |
| status | `Archived` |
| `approvedAt` | `2026-10-01T10:00:00.000Z` |
| archive time | `2026-10-01T10:30:00.500Z` |
| manual retries (halts) | 1 |
| reported cost | 0.75 |
| dead attempts | task `2`, reason `verify_failed` |

#### Scenario: Active change snapshot
- **WHEN** `read_change` reads the fixture change `003-beta`
- **THEN** its id is `003`, its title is `Beta`, it is not approved, its one task `1` is titled `When beta, waits` and folds to `Pending`, and its status is `Unapproved`

### Requirement: Text fields
Storage SHALL read Markdown files only as far as its tables need, with
TypeScript's rules: `frontmatter_string` gives a top-level frontmatter key's
string value, `markdown_body` the text after the frontmatter, `goal_section`
the trimmed text after the first `## Goal` heading up to the next line that
starts with `##` and a space, and `timestamp_ms` the epoch milliseconds of a
`YYYY-MM-DDTHH:MM:SS.mmmZ` timestamp, the only form osq writes.

#### Scenario: Frontmatter and body
- **WHEN** each text below is read
- **THEN** the frontmatter `title` and the body are as given:

| Text | `title` | Body |
|---|---|---|
| `---\ntitle: "  Alpha  "\n---\nbody` | `  Alpha  ` | `body` |
| `---\ntitle: 12\n---\nbody` | none | `body` |
| `---\ntitle: yes\n---\n` | `yes` | empty |
| `---\r\ntitle: x\r\n---\r\nrest` | `x` | `rest` |
| `no frontmatter` | none | `no frontmatter` |
| `---\ntitle: [unclosed\n---\nbody` | none | the whole text |

#### Scenario: Goal section
- **WHEN** the Goal section of each body below is read
- **THEN** it is as given:

| Body | Goal |
|---|---|
| `## Goal\n\nShip it.\n\n## Verify\nx` | `Ship it.` |
| `## goal  \nLower case.` | `Lower case.` |
| `## Goal\n### Sub\ntext\n## Next` | `### Sub\ntext` |
| `## Goal\nA\n##Tight\nB\n## Next` | `A\n##Tight\nB` |
| `Intro\n### Goal\nDeep.\n## Next` | `Deep.` |
| `## Goal\n## Verify\nx` | `## Verify\nx` |
| `## Goals\nNot it.\n` | none |

#### Scenario: Timestamps
- **WHEN** each text below is read as a timestamp
- **THEN** its epoch milliseconds are as given:

| Text | Milliseconds |
|---|---|
| `2026-10-01T10:30:00.500Z` | 1790850600500 |
| `1970-01-01T00:00:00.000Z` | 0 |
| `2024-02-29T23:59:59.999Z` | 1709251199999 |
| `2026-10-01 10:30:00Z` | none |
| `2026-13-01T00:00:00.000Z` | none |
| `2026-10-01T10:30:00Z` | none |

### Requirement: Event file errors
Storage SHALL read every events file whose name rust-core's
`Stream::from_file_name` knows, skip only blank lines, and fail on any other
line rust-core's `parse_event_line` refuses with a `StorageError` naming the
file, the 1-based line number and the `EventError`. It SHALL never skip a
malformed line.

#### Scenario: Malformed event line
- **WHEN** `read_change` reads the fixture change `crates/kernel/storage/tests/fixtures/broken/openspec/changes/001-broken`, whose `.run/events/1.jsonl` holds a valid line, a blank line and then `{not json`
- **THEN** it fails with an error naming `1.jsonl`, line 3 and `NotJson`

#### Scenario: Blank lines are allowed
- **WHEN** `read_change` reads the fixture change `001-alpha`, whose `.run/events/2.jsonl` holds a blank line between two events
- **THEN** it succeeds and task `2` has 2 started events

### Requirement: Archived location wins
A change under `archive/` SHALL have the status `Archived` and a change under
`rejected/` the status `Rejected`, whatever its markers or folded events say.
Only an active change SHALL take its status from rust-core's
`change_status`, with `approved` true when `.run/approved` exists.

#### Scenario: Stale markers in an archived change
- **WHEN** `read_change` reads the fixture change `010-late`, which holds `.run/running`, `.run/regressed` and a task stream that ends in `dead`, and has no `change.jsonl`
- **THEN** its status is `Archived`

#### Scenario: Rejected change
- **WHEN** `read_change` reads the fixture change `004-gamma`
- **THEN** its status is `Rejected`

### Requirement: Read model tables
`write_read_model(db_path, snapshots)` SHALL write a SQLite database holding
the tables `changes`, `tasks` and `dead_attempts`, created with untyped columns
named as TypeScript's `osq query` names them, with one set of rows per
archived snapshot in the given order. Each column SHALL follow the rule in the
scenarios below. `build_read_model(project_root, db_path)` SHALL read the
archived changes with `read_archive` and write them.

#### Scenario: Columns of the changes table
- **WHEN** the `changes` row of an archived change is written
- **THEN** each column holds:

| Column | Value |
|---|---|
| `id` | the folder's leading digits, as text |
| `folder` | the folder name |
| `title` | `proposal.md` frontmatter `title` when it is a string, trimmed; null when empty |
| `archived_on` | the UTC day `YYYY-MM-DD` of the last `archived` event in `change.jsonl`; null without one |
| `goal` | the `## Goal` section of the proposal body, trimmed; null when absent or empty |
| `tasks` | the number of `tasks/*.md` files |
| `attempts` | the `started` events in every `<n>.jsonl` stream; null without `.run/events/` |
| `halts` | the `retry` events whose `automatic` is not true, in every `<n>.jsonl` stream and `change.jsonl`; null without `.run/events/` |
| `elapsed_seconds` | the milliseconds from `approvedAt` to the archive time, rounded half up to seconds; null when either is missing, `.run/approved` is missing, or the difference is negative |
| `cost` | the sum of every `tokens` event's `cost`, task streams in task order and events in file order; null when none reports one |
| `planner` | `.run/manifest.json` `planner`, trimmed, else `brief.md` frontmatter `planner`, trimmed; null when neither is a non-empty string |

#### Scenario: Columns of the tasks and dead_attempts tables
- **WHEN** the `tasks` and `dead_attempts` rows of an archived change are written
- **THEN** `tasks` holds one row per `tasks/<n>.md` in task order, as `change` (the folder), `task` (`<n>`), `title` (the frontmatter `title` when it is a string, trimmed, else empty text), `attempts` (the `started` events in `<n>.jsonl`, 0 without one) and `done` (1 when `.run/done/<n>` exists, else 0); and `dead_attempts` holds one row per `dead` event in the `<n>.jsonl` streams in task and file order, as `change`, `task` (the event's `task`, trimmed, else `<n>`) and `reason` (trimmed, else `unknown`)

#### Scenario: Fixture project rows
- **WHEN** `build_read_model` reads the fixture project
- **THEN** the `changes` table holds exactly these rows:

| id | folder | title | archived_on | goal | tasks | attempts | halts | elapsed_seconds | cost | planner |
|---|---|---|---|---|---|---|---|---|---|---|
| `001` | `001-alpha` | `Alpha` | `2026-10-01` | `Ship alpha.` | 3 | 3 | 1 | 1801 | 0.75 | `opus` |
| `002` | `002-plain` | null | null | null | 0 | null | null | null | null | `brief-planner` |
| `010` | `010-late` | `Late` | null | null | 1 | 1 | 0 | null | null | null |

- **AND** the `tasks` table holds exactly these rows:

| change | task | title | attempts | done |
|---|---|---|---|---|
| `001-alpha` | `1` | `When one, first` | 1 | 1 |
| `001-alpha` | `2` | `When two, second` | 2 | 1 |
| `001-alpha` | `10` | `When ten, tenth` | 0 | 0 |
| `010-late` | `1` | `When late, dead` | 1 | 0 |

- **AND** the `dead_attempts` table holds exactly these rows:

| change | task | reason |
|---|---|---|
| `001-alpha` | `2` | `verify_failed` |
| `010-late` | `1` | `unknown` |

### Requirement: Read model rebuild
The read model SHALL be a cache: `write_read_model` SHALL replace any
database already at `db_path`, and no state SHALL live only in it.

#### Scenario: Delete and rebuild
- **WHEN** `build_read_model` builds the fixture project's database, the rows of its three tables are read, the file is deleted, and `build_read_model` builds it again
- **THEN** the rows of the three tables are equal to the first rows

#### Scenario: Rebuild over a stale database
- **WHEN** `build_read_model` writes to a path that already holds a database with an extra `changes` row
- **THEN** the `changes` table holds only the fixture project's three rows

### Requirement: Archive replay
`read_archive(project_root)` SHALL read every archived change in listing
order and fail on the first it cannot read. Outside the named exceptions,
004 to 013, whose watcher wrote no `done` event and which only have to read,
each task's folded status SHALL be `Done` exactly when its `.run/done/<n>`
marker exists. The replay over this repository's archive is a corpus test in
`tests/archive_corpus.rs`.

#### Scenario: Fixture archive reads
- **WHEN** `read_archive` reads the fixture project
- **THEN** it returns the snapshots of `001-alpha`, `002-plain` and `010-late`, in that order, each with the status `Archived`

#### Scenario: Archived changes replay
- **WHEN** `read_archive` reads this repository's `openspec/changes/archive/`
- **THEN** it reads at least 200 changes without an error, every task of every change except 004 to 013 folds to `Done` exactly when its done marker exists, and every change numbered 038 or higher holds an `archived` event in `change.jsonl`

### Requirement: TypeScript row parity
For the archived changes 014 to 209, the rows of `changes`, `tasks` and
`dead_attempts` SHALL equal the rows TypeScript's `osq query --json` printed
for them, committed as JSON fixtures under `crates/kernel/storage/tests/golden/`.
Text and null SHALL be equal as written and numbers equal by value. The
comparison is a corpus test in `tests/archive_corpus.rs`; the fixture rows of
"Read model tables" are its fast counterpart.

#### Scenario: Golden rows
- **WHEN** the read model is written from this repository's archive and its rows for folders numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the 194 rows of `changes.json`, the 665 rows of `tasks.json` and the 50 rows of `dead_attempts.json`
