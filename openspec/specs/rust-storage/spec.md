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
| dead attempts | task `2`, reason `verify_red` |

#### Scenario: Active change snapshot
- **WHEN** `read_change` reads the fixture change `003-beta`
- **THEN** its id is `003`, its title is `Beta`, it is not approved, its one task `1` is titled `When beta, waits` and folds to `Pending`, and its status is `Unapproved`

### Requirement: Text fields
Storage SHALL read Markdown files only as far as its tables need, with
TypeScript's rules, splitting frontmatter with rust-specs
`parse_frontmatter`: `frontmatter_string` gives a top-level frontmatter
key's string value, `markdown_body` the text after the frontmatter,
`goal_section` the trimmed text after the first `## Goal` heading up to the
next line that starts with `##` and a space, and `timestamp_ms` the epoch
milliseconds of a `YYYY-MM-DDTHH:MM:SS.mmmZ` timestamp, the only form osq
writes. A document whose frontmatter `parse_frontmatter` refuses reads as
having no frontmatter, with its whole text as its body. For frontmatter
that is YAML but not a mapping this departs from TypeScript, which gives
the text after it, as rust-specs "Frontmatter" departs; no archived
document has one.

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

#### Scenario: Frontmatter the specs kernel refuses
- **WHEN** each text below is read
- **THEN** the frontmatter `title` and the body are as given:

| Text | `title` | Body |
|---|---|---|
| `---\n- a\n---\nbody` | none | the whole text |
| `---\ntitle: a\nb: : :\n---\nbody` | none | the whole text |

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
the tables `changes`, `tasks` and `dead_attempts`, the nine tables of "Event
table columns", the two of "File table columns" and the two of "Spec table
columns", created with untyped columns named as TypeScript's `osq query`
names them. `changes`, `tasks`, `dead_attempts`, `disclosures` and
`requirements` SHALL hold rows of archived snapshots in the given order; a
rejected snapshot adds rows to `notices` only. `build_read_model(project_root,
db_path)` SHALL first read the trial labels, the archived and rejected
changes with `read_history`, the manual edit records, and the ownership
rust-specs `read_capability_ownership` reads from `openspec/specs/`. It SHALL
then, in one `replace_read_model` transaction, write the changes, fill the
labels, add the manual edit records, and fill `task_outcomes` with the rows
`write_task_outcomes` writes. A column that holds a rust-core reason or
outcome SHALL hold its `as_str` text.

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
- **THEN** `tasks` holds one row per `tasks/<n>.md` in task order, as `change` (the folder), `task` (`<n>`), `title` (the frontmatter `title` when it is a string, trimmed, else empty text), `attempts` (the `started` events in `<n>.jsonl`, 0 without one) and `done` (1 when `.run/done/<n>` exists, else 0); and `dead_attempts` holds one row per `dead` event in the `<n>.jsonl` streams in task and file order, as `change`, `task` (the event's `task`, trimmed, else `<n>`) and `reason` (the event's reason)

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
| `001-alpha` | `2` | `verify_red` |
| `010-late` | `1` | `timeout` |

### Requirement: Read model rebuild
The read model SHALL be a cache, and no state SHALL live only in it.
`replace_read_model(db_path, fill)` SHALL remove any file at the rebuild
path, which is `db_path` with `.rebuild` appended, create every table in a
new database there, run `fill` on one transaction of one connection, commit
it, and rename the rebuild file over `db_path`. When any step fails, it
SHALL remove the rebuild file and return the step's error, leaving the file
at `db_path` as it was, or no file when there was none. `write_read_model`
and `build_read_model` SHALL write only through `replace_read_model`, so a
build that fails at any step leaves the previous database whole.

#### Scenario: Delete and rebuild
- **WHEN** `build_read_model` builds the fixture project's database, the rows of its three tables are read, the file is deleted, and `build_read_model` builds it again
- **THEN** the rows of the three tables are equal to the first rows

#### Scenario: Rebuild over a stale database
- **WHEN** `build_read_model` writes to a path that already holds a database with an extra `changes` row
- **THEN** the `changes` table holds only the fixture project's three rows

#### Scenario: Failed rebuild keeps the previous database
- **WHEN** `build_read_model` has built the fixture project's database, and `replace_read_model` then runs at the same path a fill that inserts a `changes` row and returns an error
- **THEN** `replace_read_model` returns that error, the three tables hold the first build's rows, and no rebuild file is left

#### Scenario: Failed first build writes no database
- **WHEN** `replace_read_model` runs a fill that returns an error at a path where no file exists
- **THEN** it returns that error, and neither the path nor the rebuild file exists

#### Scenario: Leftover rebuild file
- **WHEN** the rebuild file holds the text `interrupted` and `build_read_model` builds the fixture project's database
- **THEN** the database holds the fixture project's rows and no rebuild file is left

#### Scenario: Database path that cannot be replaced
- **WHEN** `write_read_model` writes to a path that is a directory
- **THEN** it fails with `ReadModelError::Io`, the directory is still there, and no rebuild file is left

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

### Requirement: TypeScript row parity
For the archived changes 014 to 209, the rows of `changes`, `tasks`,
`dead_attempts`, the nine event tables and `disclosures` SHALL equal the rows
TypeScript's `osq query --json` printed for them, and for the archived
changes 001 to 215 so SHALL the rows of `requirements` and `task_outcomes`,
the latter written with the Code ownership TypeScript read when it printed
them. The rows are committed as JSON fixtures under
`crates/kernel/storage/tests/golden/`. Text and null SHALL be equal as
written and numbers equal by value. The comparisons are corpus tests:
`tests/archive_corpus.rs` for the first three tables,
`tests/history_corpus.rs` for the event tables, `tests/files_corpus.rs` for
`disclosures` and `tests/specs_corpus.rs` for `requirements` and
`task_outcomes`. The fixture rows of "Read model tables", "History fixture
rows", "Files fixture rows" and "Spec tables fixture rows" are their fast
counterparts.

#### Scenario: Golden rows
- **WHEN** the read model is written from this repository's archive and its rows for folders numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the 194 rows of `changes.json`, the 665 rows of `tasks.json` and the 50 rows of `dead_attempts.json`

#### Scenario: Golden event table rows
- **WHEN** `build_read_model` builds the read model of this repository and the rows of the nine event tables whose `change` is numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the rows of the same-named JSON files: 44 in `recertifications.json`, 251 in `notices.json`, 50 in `validator_runs.json`, 1 in `link_findings.json`, and none in `pauses.json`, `focused_runs.json`, `mutation_picks.json`, `mutation_survivors.json` and `validator_findings.json`

#### Scenario: Golden disclosure rows
- **WHEN** `build_read_model` builds the read model of this repository and the `disclosures` rows whose `change` is numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the 661 rows of `tests/golden/files/disclosures.json`

#### Scenario: Golden spec table rows
- **WHEN** this repository's archived changes numbered 001 to 215 are read with `read_history`, written with `write_read_model`, and given `task_outcomes` with `write_task_outcomes` and the ownership in `tests/golden/specs/ownership.json`
- **THEN** the `requirements` rows, read in table order, equal the 1683 rows of `tests/golden/specs/requirements.json`, and the `task_outcomes` rows equal the 732 rows of `tests/golden/specs/task_outcomes.json`

### Requirement: Table events
`read_change` SHALL keep, in the snapshot's `EventFacts`, every event the
event tables are built from, each with its stream and timestamp, in the order
the events are folded: task streams in task order and each file in line
order, then `change.jsonl`. It SHALL keep the `paused`, `recertification`,
`focused_ran` and `mutation_ran` events of the task streams and the
`validator_ran` events of `change.jsonl`, and no other event.

#### Scenario: Kept events of the history fixture
- **WHEN** `read_change` reads `001-run` of the history fixture project
- **THEN** its facts keep exactly these events, in this order:

| Stream | Type | Timestamp |
|---|---|---|
| task `1` | `paused` | `2026-10-01T10:02:00.000Z` |
| task `1` | `focused_ran` | `2026-10-01T10:03:00.000Z` |
| task `1` | `mutation_ran` | `2026-10-01T10:04:00.000Z` |
| task `1` | `recertification` | `2026-10-01T10:05:00.000Z` |
| task `2` | `focused_ran` | `2026-10-01T10:07:00.000Z` |
| task `2` | `mutation_ran` | `2026-10-01T10:08:00.000Z` |
| task `2` | `recertification` | `2026-10-01T10:09:00.000Z` |
| task `2` | `recertification` | `2026-10-01T10:10:00.000Z` |
| task `10` | `paused` | `2026-10-01T10:12:00.000Z` |
| change | `validator_ran` | `2026-10-01T10:14:00.000Z` |
| change | `validator_ran` | `2026-10-01T10:15:00.000Z` |

### Requirement: Plan records
`read_change` SHALL read `.run/plan.jsonl` into the snapshot's plan records,
in file order, as TypeScript's `readPlanReady` does. A line is a record only
when it is a JSON object whose `type` is `plan_ready`, whose `timestamp` is a
non-empty string, and whose `data` is an object with a string `hash` and a
`notices` array in which every entry is an object with a string `id`, a
`severity` of `red`, `amber` or `grey`, and a boolean `folded`. Any other
line, blank or not JSON, is left out without an error, and a missing or
unreadable file reads as no records. A record's notices keep `id` and
`severity`. Its link findings are present only when `data.traceability` is an
array, and keep, in order, the entries that are objects with string
`severity`, `file` and `message`.

#### Scenario: Plan records of the history fixture
- **WHEN** `read_change` reads `001-run` of the history fixture project
- **THEN** it holds two plan records: the first with the notice `draft-only` (`amber`) and no link findings, and the second with the notice `scope-wide` (`red`) and the one link finding `warning`, `src/a.rs`, `src/a.rs:3: tag is not valid`

#### Scenario: No plan file
- **WHEN** `read_change` reads `002-quiet` of the history fixture project
- **THEN** it holds no plan records

### Requirement: Manifest notices
`read_change` SHALL read the `notices` record of `.run/manifest.json`, as
"Manifest file" types it. The record is present when the manifest holds
`notices`. Its items keep, in order, the entries that are objects with a
string `id` and a string `severity`. Its opened ids are the string entries
of `opened`, and absent when `opened` is null or missing.

#### Scenario: Manifest notices of the history fixture
- **WHEN** `read_change` reads the history fixture project's changes
- **THEN** their manifest notices are:

| Change | Items | Opened |
|---|---|---|
| `001-run` | `scope-wide` (`red`), `no-tests` (`grey`) | `scope-wide` |
| `002-quiet` | `no-tests` (`amber`) | absent |
| `003-dropped` | no record | no record |
| `004-noted` | `scope-wide` (`grey`) | none |

### Requirement: History reading
`read_history(project_root)` SHALL read every archived change in listing
order and then every rejected change in listing order, and fail on the first
it cannot read.

#### Scenario: History of the history fixture
- **WHEN** `read_history` reads the history fixture project
- **THEN** it returns the snapshots of `001-run` and `002-quiet` with the status `Archived`, then `003-dropped` and `004-noted` with the status `Rejected`, in that order

### Requirement: Event table columns
`write_read_model` SHALL write the nine event tables `pauses`,
`recertifications`, `notices`, `focused_runs`, `mutation_picks`,
`mutation_survivors`, `validator_runs`, `validator_findings` and
`link_findings`, with untyped columns named and ordered as TypeScript's
`osq query` lists them. Every table but `notices` SHALL hold rows of archived
snapshots only, in the given snapshot order. `notices` SHALL hold rows of
archived and rejected snapshots, ordered by folder name. Within one change,
rows follow the kept events, the plan records and the manifest items in
order. `<id>` is the folder's leading digits and `<n>` is the task id. Text
that is absent is null, counts and flags are integers, and every `label` is
null until "Trial labels" fills it.

#### Scenario: Columns of the event tables
- **WHEN** the event table rows of a change are written
- **THEN** each table holds:

| Table | One row per | Columns |
|---|---|---|
| `pauses` | kept `paused` event | `change` the folder, `task`, `paused_at` the event's timestamp, `until`, `source` |
| `recertifications` | object entry of a kept `recertification` event's `attribution`, when that is an array | `change`, `task`, `recertified_at` the event's timestamp, `outcome`, `automatic` 1 when the event's `automatic` is true else 0, `path` and `credited_to` the entry's `path` and `attribution` when strings else null, `source` `measures` when the entry's `source` is `measures`, else `file_changed` when its `attribution` is a string of digits, else null |
| `notices` | notice of every plan record but the last | `change`, `notice` the id, `severity`, `opened` null, `outcome` `planned_again` |
| `notices` | manifest notice item, when the manifest holds a notices record | `change`, `notice`, `severity`, `opened` null when the record has no opened ids, else 1 when the id is opened and 0 when not, `outcome` `rejected` for a rejected change, else `halted` when the facts count a halt, else `approved` |
| `notices` | notice of the last plan record of a rejected change without a manifest notices record | `change`, `notice`, `severity`, `opened` null, `outcome` `rejected` |
| `focused_runs` | kept `focused_ran` event | `change`, `task` `<n>`, `run` its 1-based position among the stream's `focused_ran` events, `outcome`, `exit_code`, `duration`, `timed_out` 1 or 0, `scenarios` and `files` joined by a newline, empty text for an empty list |
| `mutation_picks` | kept `mutation_ran` event | `change`, `task` `<n>`, `pick` its 1-based position among the stream's `mutation_ran` events, `file`, `function`, `outcome`, `reason` or null, `killed`, `survived`, `invalid`, `duration`, `scenarios` joined by a newline |
| `mutation_survivors` | entry of a kept `mutation_ran` event's `survivors`, when that is an array | `id` `<id>.<n>.m<pick>.<k>` with `<k>` the entry's 1-based position, `change`, `task`, `pick`, `file` the entry's string `file` else null, `function` the pick's `function`, `line` and `column` the entry's numbers else null, `mutator` and `replacement` the entry's strings else null, `label` |
| `validator_runs` | kept `validator_ran` event | `change`, `run` its 1-based position among the kept `validator_ran` events, `outcome`, `harness`, `model`, `duration`, `exit_code` or null, `scenarios`, `findings` the count of its valid findings, `reason` or null, `output` or null |
| `validator_findings` | valid finding of a kept `validator_ran` event: an object in `findings` with string `capability`, `requirement`, `scenario`, `problem` and `detail` | `id` `<id>.v<run>.<k>` with `<k>` its 1-based position among the valid findings, `change`, `run`, `finding` `<k>`, `capability`, `requirement`, `scenario`, `problem`, `detail`, `label` |
| `link_findings` | link finding of the last plan record of an archived change | `id` `<id>.l<k>` with `<k>` its 1-based position, `change`, `severity`, `file`, `message`, `label` |

#### Scenario: History fixture rows
- **WHEN** `build_read_model` reads the history fixture project
- **THEN** the rows of each of the nine event tables equal, row by row, the rows of `<table>.json` in `tests/fixtures/history-rows/`, which TypeScript's `osq query --json` printed for that project: 2 `pauses`, 4 `recertifications`, 8 `notices`, 2 `focused_runs`, 2 `mutation_picks`, 2 `mutation_survivors`, 2 `validator_runs`, 1 `validator_findings` and 1 `link_findings` row, with text and null equal as written and numbers equal by value

### Requirement: Trial labels
`build_read_model` SHALL read `openspec/trials/validator.json` and
`openspec/trials/traceability.json` under the project root before it writes
the database. The labels of `validator.json` SHALL fill the `label` column of
`validator_findings`, and those of `traceability.json` the `label` column of
`mutation_survivors` and `link_findings`, by `id`: 1 for an id labelled true,
0 for false, and null for an id with no label. A label whose id names no row
is ignored. A missing file holds no labels. A file that is not a JSON object
whose values are all true or false SHALL fail the build with the message
`openspec/trials/<kind>.json must be a JSON object of true or false labels`,
and no database is written.

#### Scenario: Labels in the history fixture
- **WHEN** `build_read_model` reads the history fixture project
- **THEN** `validator_findings` `001.v1.1` holds the label 1, `mutation_survivors` `001.1.m1.1` holds 0 and `001.1.m1.2` holds null, and `link_findings` `001.l1` holds 1

#### Scenario: Malformed label file
- **WHEN** `build_read_model` reads the bad-labels fixture project, whose `validator.json` labels an id with the number 1
- **THEN** it fails with the message `openspec/trials/validator.json must be a JSON object of true or false labels` and writes no database file

### Requirement: Result sections
`parse_result_sections(text)` SHALL split an executor result file into the
sections `changed`, `deviated`, `missing_context`, `outside_scope`,
`blocked`, `next` and `touched`, as TypeScript's `parseResultSections` does.
A line is a heading when, trimmed, it starts with `#` or with the word
`touched`. Its name is the text after the leading `#`s with whitespace runs
collapsed to one space, trimmed, one trailing `:` dropped, and case ignored.
A heading with an unknown name ends the current section, and its lines
belong to no section. A section's lines are every line after its heading up
to the next heading, and a repeated heading appends to the same section. A
`touched` heading with text after `touched:` on the same line takes that text
as the section. A section is absent when its text, trimmed, is empty, or when
it holds one non-blank line that reads `None`, alone or followed directly by
`.`, `;`, `,` or `:` and any text, once a leading list marker (`-`, `*`, `+`
or a number and `.`) and every `*` and `_` are set aside. Any other section
is its text, trimmed.

#### Scenario: Section cases
- **WHEN** `parse_result_sections` reads each text below
- **THEN** it holds the given section:

| Text | Section | Value |
|---|---|---|
| `## Deviated\n\n- Kept it.\n\n## Next\n` | `deviated` | `- Kept it.` |
| `#  deviated:\nUsed a map.\n` | `deviated` | `Used a map.` |
| `##   Missing   Context\nNone\n` | `missing_context` | absent |
| `## Missing context\n- None.\n` | `missing_context` | absent |
| `## Missing context\n*None*\n` | `missing_context` | absent |
| `## Deviated\nNone; nothing changed.\n` | `deviated` | absent |
| `## Missing context\nNonexistent file.\n` | `missing_context` | `Nonexistent file.` |
| `## Outside scope\nNone\nA second line.\n` | `outside_scope` | `None\nA second line.` |
| `## Deviated\nOne.\n### Notes\nTwo.\n` | `deviated` | `One.` |
| `## Deviated\nOne.\n## deviated\nTwo.\n` | `deviated` | `One.\nTwo.` |
| `## Deviated\n\n## Blocked\nWaiting.\n` | `deviated` | absent |
| `## Changed\nDone.\nTouched: src/a.rs, src/b.rs\n` | `touched` | `src/a.rs, src/b.rs` |
| `## Deviated\nOne.\ntouched: src/c.rs\nmore\n` | `deviated` | `One.` |

### Requirement: Result disclosures
`read_change` SHALL read the result files `.run/results/<n>.md` whose names
are digits and `.md`, in numeric order, into the snapshot's disclosures. It
keeps one entry per file that holds a `deviated`, `missing_context` or
`outside_scope` section, with the task `<n>` as written and those three
sections. Any other file in `.run/results/` is left out. A missing folder or
an unreadable file reads as no entry.

#### Scenario: Disclosures of the files fixture
- **WHEN** `read_change` reads `001-told` of the files fixture project
- **THEN** its disclosures are:

| Task | deviated | missing_context | outside_scope |
|---|---|---|---|
| `1` | `- Kept the old name.\n  It reads better.\n\n- Split one file.` | absent | `The listing skips hidden folders.` |
| `2` | `Used a map.\n\nAnd a second deviation.` | absent | absent |
| `10` | absent | `Nonexistent file named in the task.` | `None\nThe second line keeps this section.` |

#### Scenario: No results folder
- **WHEN** `read_change` reads `002-silent` of the files fixture project
- **THEN** it holds no disclosures

### Requirement: Manual edit records
`read_manual_edits(project_root)` SHALL read the files ending in `.md`
directly in `openspec/manual/`, as TypeScript's `readManualEditRecords` does.
It leaves out a file whose frontmatter `kept_at` is not a string or whose
`paths` is not a list. A record keeps its file name, `kept_at`, the string
entries of `paths` and of `capabilities` in written order, with a missing or
non-list `capabilities` as no entries, and its body trimmed as the comment.
Records are ordered by `kept_at`, and records with equal `kept_at` by file
name. A missing folder or an unreadable file reads as no record.

#### Scenario: Records of the files fixture
- **WHEN** `read_manual_edits` reads the files fixture project
- **THEN** it returns, in this order:

| File | kept_at | Paths | Capabilities | Comment |
|---|---|---|---|---|
| `2026-10-01T08-00-00-000Z.md` | `2026-10-01T08:00:00.000Z` | none | none | `Kept a config edit.` |
| `mixed.md` | `2026-10-01T12:00:00.000Z` | `src/m.rs` | none | `Mixed lists.` |
| `2026-10-02T09-00-00-000Z.md` | `2026-10-02T09:00:00.000Z` | `src/z.rs`, `src/a.rs` | `rust-storage`, `rust-core` | `Fixed a typo by hand.\n\nSecond paragraph of the comment.` |

#### Scenario: No manual folder
- **WHEN** `read_manual_edits` reads a project root without `openspec/manual/`
- **THEN** it returns no record

### Requirement: File table columns
`write_read_model` SHALL write the tables `disclosures (change, task,
section, text)` and `manual_edits (kept_at, record, comment, paths,
capabilities)` with untyped columns. `disclosures` SHALL hold, for each
archived snapshot in the given order, one row per present section of each
disclosure in task order, sections in the order `deviated`,
`missing_context`, `outside_scope`, as `change` the folder, `task`, `section`
the section's name and `text`. `build_read_model` SHALL fill `manual_edits`
with one row per record of `read_manual_edits`, in record order, as
`kept_at`, `record` the file name, `comment`, and `paths` and `capabilities`
joined with `, `, an empty list as empty text.

#### Scenario: Files fixture rows
- **WHEN** `build_read_model` reads the files fixture project
- **THEN** the rows of `disclosures` and `manual_edits` equal, row by row, the rows of `disclosures.json` and `manual_edits.json` in `tests/fixtures/files-rows/`, which TypeScript's `osq query --json` printed for that project: 5 `disclosures` and 3 `manual_edits` rows, with text and null equal as written

### Requirement: Delta capabilities
`read_change` SHALL read the delta specs of a change into the snapshot's
`deltas`: one `CapabilityDelta { capability, delta }` per folder directly
under the change's `specs/` that holds a `spec.md`, in folder name order by
bytes, the delta parsed with the specs kernel's `read_delta`. A folder
without `spec.md` is left out, and a change without `specs/` has no deltas.
A `spec.md` that cannot be read SHALL fail the read with
`StorageError::Specs`, holding the specs kernel's error, which names the
file.

#### Scenario: Deltas of the spec tables fixture
- **WHEN** `read_change` reads `001-planned` of the spec tables fixture project
- **THEN** its deltas are, in this order:

| Capability | Added | Modified | Removed | Renamed |
|---|---|---|---|---|
| `alpha` | `Alpha added`, `Alpha second added` | `Alpha modified` | `Alpha removed` | `Alpha old name` to `Alpha new name` |
| `beta` | `Beta added` | none | none | none |

#### Scenario: No delta folder
- **WHEN** `read_change` reads `002-bare` of the spec tables fixture project
- **THEN** it has no deltas

### Requirement: Task plans
`read_change` SHALL parse each task file with the specs kernel's
`read_task_file` into that task's `plan`, and SHALL set the snapshot's
`verify` to the `verify` that the specs kernel's `read_proposal` reads from
`proposal.md`, or to empty text when the change has no `proposal.md`. A task
file or proposal the specs kernel refuses SHALL fail the read with
`StorageError::Specs`, holding the specs kernel's error, which names the
file.

#### Scenario: Plans of the spec tables fixture
- **WHEN** `read_change` reads `001-planned` of the spec tables fixture project
- **THEN** its `verify` is `node verify.cjs`, and its tasks' plans hold:

| Task | Scope | Verify | Tests modify | Verify starts |
|---|---|---|---|---|
| `1` | `src/alpha/**`, `tests/alpha.test.ts` | `node --test tests/alpha.test.ts tests/alpha.test.ts` | false | red |
| `2` | `src/beta/**` | `node --test 'tests/a.test.ts' "src/b.spec.ts"` | true | red |
| `3` | `src/alpha/**` | `node --test tests/*.test.ts` | false | green |
| `4` | none | `node verify.cjs` | false | any |
| `10` | `./src/alpha/**`, `src/shared.ts` | `cargo test -p alpha` | false | red |

#### Scenario: Proposal without a verify
- **WHEN** `read_change` reads `002-bare` of the spec tables fixture project
- **THEN** its `verify` is empty text

#### Scenario: Refused task file
- **WHEN** `read_change` reads a change whose `tasks/1.md` frontmatter is `title: [unclosed`
- **THEN** it fails with `StorageError::Specs`, and the error's message names that `tasks/1.md`

### Requirement: Task stream outcomes
`read_change` SHALL give each task an `outcome` read from its own
`<n>.jsonl` stream, as TypeScript's `deriveTaskOutcomes` reads it:

- `start_scope_files`: the `scope_files` of the first `measures` event whose
  phase is `start`; none without one.
- `scope_hash_paths`: the keys of `scope_hashes` in the last `measures` event
  whose phase is `end` and whose `scope_hashes` is a JSON object, sorted by
  bytes; none without one.
- `changed_files`: the `changed_files` of the last `measures` event whose
  phase is `end`; none when that event has none, even when an earlier `end`
  event has one.
- `first_attempt_passed`: true when the stream's first `started` event is
  followed by a `done` event before any other `started`, `dead` or
  `regressed` event; events before the first `started` count for nothing.

A task without a stream gets no `start_scope_files`, no `scope_hash_paths`,
no `changed_files`, and `first_attempt_passed` false.

#### Scenario: Outcomes of the spec tables fixture
- **WHEN** `read_change` reads `001-planned` of the spec tables fixture project
- **THEN** its tasks' outcomes are:

| Task | start_scope_files | scope_hash_paths | changed_files | first_attempt_passed |
|---|---|---|---|---|
| `1` | 2 | `src/alpha/a.ts`, `src/alpha/b.ts`, `src/beta/c.ts` | 3 | true |
| `2` | 1 | none | 5 | false |
| `3` | none | `src/shared.ts` | none | false |
| `4` | none | none | none | false |
| `10` | none | `notes/z.md`, `src/alpha/x.ts`, `src/beta/y.ts` | 3 | false |

#### Scenario: Task without a stream
- **WHEN** `read_change` reads `002-bare` of the spec tables fixture project
- **THEN** task `1` has no `start_scope_files`, no `scope_hash_paths`, no `changed_files`, and `first_attempt_passed` false

### Requirement: Spec table columns
`write_read_model` SHALL write the tables `requirements (change, capability,
kind, requirement, renamed_from)` and `task_outcomes (change, task,
capability, scope_globs, scope_files, verify_kind, tests_modify,
verify_starts, shares_scope, position, attempts, first_attempt, dead_reason,
files_touched)` with untyped columns, and SHALL fill `requirements` for each
archived snapshot in the given order. For each delta in order it holds one
row per added, then modified, then removed requirement name, as `change` the
folder, `capability`, `kind` `added`, `modified` or `removed`, `requirement`
the name and `renamed_from` null, then one row per rename, as kind
`renamed`, `requirement` the new name and `renamed_from` the old.
`write_task_outcomes(db_path, snapshots, ownerships)` SHALL fill
`task_outcomes` for each archived snapshot in the given order, one row per
task in task order, as TypeScript's `deriveTaskOutcomes` does.

#### Scenario: Columns of the task_outcomes table
- **WHEN** the `task_outcomes` row of one task of an archived change is written
- **THEN** each column holds:

| Column | Value |
|---|---|
| `change` | the folder name |
| `task` | `<n>` |
| `capability` | null without `scope_hash_paths`; else the capability that rust-specs `owner_capabilities` returns for the most of those paths, a path with two owners counting for both, the first by bytes on a tie; null when no path has an owner |
| `scope_globs` | the number of entries in the plan's `scope` |
| `scope_files` | null without `start_scope_files`; else the number of `scope_hash_paths` when there are any, else `start_scope_files` |
| `verify_kind` | `one`, `several`, `suite` or `other`, by "Verify kinds" |
| `tests_modify` | 1 when the plan's `tests_modify` is true, else 0 |
| `verify_starts` | the plan's `verify_starts` as `red`, `green` or `any` |
| `shares_scope` | 1 when any of the plan's `scope` entries, as written, is an entry of an earlier task of the same change, else 0 |
| `position` | the task's 1-based place in task order |
| `attempts` | the `started` events of the task's stream, 0 without one |
| `first_attempt` | 1 when `first_attempt_passed` is true, else 0 |
| `dead_reason` | the `reason` of the change's last dead attempt whose task is `<n>`; null without one |
| `files_touched` | `changed_files`; null without it |

#### Scenario: Verify kinds
- **WHEN** a task's `verify_kind` is worked out
- **THEN** its verify splits on whitespace, as JavaScript's `\s` matches it, into tokens; each token loses one leading and one trailing `'` or `"`, and empty tokens are dropped; of the distinct tokens left, each whose last `/`-separated segment, once trailing `/` are removed, holds `.test.` or `.spec.` counts 2 when it holds `*` and 1 otherwise; a total of 1 is `one`, more is `several`, and 0 is `suite` when the task's verify equals the snapshot's `verify` and `other` otherwise

#### Scenario: Spec tables fixture rows
- **WHEN** `build_read_model` reads the spec tables fixture project
- **THEN** the rows of `requirements` and `task_outcomes` equal, row by row, the rows of `requirements.json` and `task_outcomes.json` in `tests/fixtures/spec-tables-rows/`, which TypeScript's `osq query --json` printed for that project: 6 `requirements` and 6 `task_outcomes` rows, with text and null equal as written and numbers equal by value

### Requirement: Change folder seal
`change_folder_seal` SHALL give the seal of a change folder as
`hashChangeFolder` does: it SHALL walk the folder without following symbolic
links, leave out every path with a `.run`, `.git` or `.DS_Store` segment at any
depth and `plan-prompt.md` at the folder's root only, read every regular file
as bytes, pass each relative path, with `/` separators, and its bytes to
rust-core's `compute_seal`, and return the `ComputedSeal` it gives, so the
result can approve a change. A file or folder it cannot read SHALL be a
`StorageError` naming its path.

#### Scenario: Fixture folder seals
- **WHEN** `change_folder_seal` reads each folder under `tests/fixtures/seal/`
- **THEN** its seal is the one `tests/golden/seals.json` gives for the folder's name, as `hashChangeFolder` printed it:

| Folder | Seal |
|---|---|
| `plain` | `sha256:04b069baa8fc74930547d24536bf9adf89bb9cbbc42ed4a424a6d95c4dd7a5dd` |
| `plan-prompt` | `sha256:6bef426385ab92db4a312a13e3390e4698eee6e779ec005f011bc2a5db21f4d3` |
| `ticked` | `sha256:5dc64102a380b020a16fa5b5b6567d7efb7a41a14f196bf09a6afea1c20473b0` |
| `undecodable` | `sha256:ac76a0c3f8f2715a692dccc3440f2b3492ff854c1bdcf6ccfe0bdc794ef57653` |
| `unicode-order` | `sha256:85a79ea72b560017a34fe04906aa20267044480e67b5269c87d6af85c1d7d588` |

#### Scenario: Paths left out of the seal
- **WHEN** a temporary copy of `tests/fixtures/seal/plain` gains each addition below, one copy per row
- **THEN** its seal is still `sha256:04b069baa8fc74930547d24536bf9adf89bb9cbbc42ed4a424a6d95c4dd7a5dd`:

| Addition |
|---|
| `.run/approved` holding `sha256:` and 64 `a` |
| `.git/HEAD` holding `ref: refs/heads/main` |
| `specs/.DS_Store` holding `x` |
| `specs/demo/.run/done/1` holding nothing |
| `plan-prompt.md` holding `prompt` |
| a symbolic link `link.md` to `proposal.md` |
| `proposal.md` rewritten with every LF as CRLF |

#### Scenario: Empty folder seal
- **WHEN** `change_folder_seal` reads an empty folder
- **THEN** its seal is `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

#### Scenario: Unreadable change folder
- **WHEN** `change_folder_seal` reads a path that does not exist
- **THEN** it gives a `StorageError` that names that path

### Requirement: Archived seals
Every archived change folder with a `.run/approved` marker SHALL have the
seal its marker holds, except changes 002 to 016 and 018 to 027, which change
028 rewrote after their approval. Change 001 has no marker.

#### Scenario: Archived changes keep their seals
- **WHEN** `change_folder_seal` reads every folder under `openspec/changes/archive/` that has `.run/approved`
- **THEN** each seal equals its marker's text, and the folders whose seal differs are exactly 002 to 016 and 018 to 027

### Requirement: Manifest file
`read_change` SHALL read `.run/manifest.json` into a typed manifest holding
the fields osq writes, each one optional: `hashes` (an object whose values
are text or null), `osqVersion`, `harness`, `model`, `createdAt`,
`createdAtSource` and `approvedAt` (text), `planner` and `effort` (text or
null), `planningSessions` (a whole number), `approvalFlags` (an object of
`ids`, a list of text, and `mode`, text), `decisions` (an object whose
values are text), and `notices` (an object of an `items` list and an
`opened` list or null). Other keys are ignored. A missing manifest reads as
no manifest. A manifest that is not JSON, is not an object, or holds one of
these fields with another type SHALL fail `read_change` with
`StorageError::Manifest`, whose message starts with the manifest's path; a
manifest that exists but cannot be read as text fails with
`StorageError::Read` naming it.

#### Scenario: Manifest files read or refused
- **WHEN** `read_change` reads an active change whose `.run/manifest.json` is each entry below
- **THEN** the result is as given:

| Manifest | Result |
|---|---|
| no file | reads; planner none, manifest notices none |
| `{"planner": " ada ", "extra": 1}` | reads; planner `ada` |
| `{"planner": null, "effort": null, "notices": {"items": [], "opened": null}}` | reads; planner none, manifest notices with no items and opened absent |
| `{not json` | `StorageError::Manifest`, message starts with the manifest's path |
| `[]` | `StorageError::Manifest`, message starts with the manifest's path |
| `{"approvedAt": 5}` | `StorageError::Manifest`, message starts with the manifest's path |
| `{"notices": {"opened": []}}` | `StorageError::Manifest`, message starts with the manifest's path |
| a directory | `StorageError::Read` naming the manifest's path |

### Requirement: One frontmatter reader
Storage SHALL split and parse frontmatter only through rust-specs
`parse_frontmatter`, and SHALL hold no YAML parser call of its own except
the exact `cost` read of a `tokens` event line.

#### Scenario: Storage has no frontmatter parser of its own
- **WHEN** the source files under `crates/kernel/storage/src` are read
- **THEN** `YamlLoader` appears only in `read/snapshot/events.rs`

### Requirement: Marker facts
`read_change(entry)` SHALL also read what a change's `.run/` markers say,
as TypeScript's `readChangeFolder` and the inbox read them. Each `TaskFile`
SHALL hold `markers: TaskMarkers`, and the `ChangeSnapshot` SHALL hold
`change_regressed: Option<HaltMarker>`, read from
`.run/regressed/change.md`.

- `TaskMarkers` holds `dead: Option<HaltMarker>` from
  `.run/dead/<n>.md`, `regressed: Option<HaltMarker>` from
  `.run/regressed/<n>.md`, `lock: Option<RunningLock>` from
  `.run/running/<n>.pid`, and `blocked: Option<String>`, the `## Blocked`
  section `parse_result_sections` gives for `.run/results/<n>.md`, where
  `<n>` is the task id. A task with none of these files holds the
  `Default` markers: all four `None`.
- `HaltMarker` holds `reason: String`, `stuck: bool`,
  `verification_passed: bool`, `fingerprint: Option<String>` and
  `entries: Vec<String>`. A marker file that exists always gives a
  `HaltMarker`, even when it cannot be read or parsed. `reason` is the
  frontmatter's `reason` when it is a string, else empty text.
  `fingerprint` is the frontmatter's `fingerprint` when it is a string, else
  `None`. `stuck` and `verification_passed` are true only when the
  frontmatter's `stuck` and `verification_passed` are the boolean `true`.
  `entries` holds, in order, the text after a leading `-` and whitespace on
  each line of the body after the frontmatter, trimmed, for every such line
  whose text is not empty.
- `RunningLock` holds `pid: u64` and `started_at_ms: i64`, read from a
  lock file holding a JSON object whose `pid` is a whole number of at least
  0 and whose `startedAt` is a whole number. Any other lock file, or one
  that cannot be read, gives `None`.
- Marker files whose name is not `<task id>.md` or `<task id>.pid`, such as
  `3.1.md` for an earlier attempt, belong to no task.

Frontmatter is split and parsed only through the specs kernel's
`parse_frontmatter`. Tests build each change folder below under
`CARGO_TARGET_TMPDIR`, since `.run/running/` and `*.pid` files are not
committed.

#### Scenario: Markers of a halted change
- **WHEN** `read_change` reads an active change folder `050-halted` with task files `1.md` to `5.md` and these files: `.run/dead/1.md` with frontmatter `reason: blocked` and body `Blocked.`; `.run/results/1.md` holding `## Blocked`, a blank line and `Need the key.`; `.run/dead/2.md` with frontmatter `reason: timeout`, `fingerprint: sha256:2` and `stuck: true`, and body lines `Timed out:`, `- a.rs`, `-   b.rs  `, `- ` and `c.rs`; `.run/regressed/3.md` with frontmatter `reason: scope_regression` and `verification_passed: true`; `.run/regressed/change.md` with frontmatter `reason: verify_red`; `.run/running/4.pid` holding `{"pid":4242,"startedAt":1760000000000}`; `.run/dead/5.md` holding only `crashed` with no frontmatter; and `.run/dead/3.1.md` with frontmatter `reason: crashed`
- **THEN** the snapshot's markers are:

| Marker | Value |
|---|---|
| task `1` dead | reason `blocked`, stuck false, verification passed false, entries none |
| task `1` blocked | `Need the key.` |
| task `2` dead | reason `timeout`, stuck true, verification passed false, entries `a.rs`, `b.rs` |
| task `3` regressed | reason `scope_regression`, stuck false, verification passed true, entries none |
| task `3` dead | `None` |
| task `4` lock | pid 4242, started at 1760000000000 |
| task `5` dead | reason empty, stuck false, verification passed false, entries none |
| task `5` lock | `None` |
| change regressed | reason `verify_red`, stuck false, verification passed false, entries none |

#### Scenario: Markers that do not read
- **WHEN** `read_change` reads an active change folder `051-odd` with task files `1.md` to `4.md` and these files: `.run/dead/1.md` with frontmatter `reason: 7` and `stuck: "yes"`; `.run/running/2.pid` holding `not json`; `.run/running/3.pid` holding `{"pid":"9","startedAt":1}`; and `.run/running/4.pid` holding `{"pid":9,"startedAt":1.5}`
- **THEN** task `1`'s dead marker has reason empty and stuck false, tasks `2`, `3` and `4` have no lock, task `1` has no lock and no blocked section, and the change has no regressed marker

#### Scenario: Marker fingerprint
- **WHEN** `read_change` reads an active change folder `052-stuck` with task files `1.md` to `3.md` and these files: `.run/dead/1.md` with frontmatter `reason: timeout`, `fingerprint: sha256:0008` and `stuck: true`; `.run/dead/2.md` with frontmatter `reason: timeout` and `fingerprint: 8`; and `.run/regressed/3.md` with frontmatter `reason: verify_red`
- **THEN** task `1`'s dead marker has the fingerprint `sha256:0008` and stuck true, task `2`'s dead marker has no fingerprint, and task `3`'s regressed marker has no fingerprint

### Requirement: Planning facts
`read_change(entry)` SHALL also say whether the folder holds a proposal and
a brief, and what its proposal's human steps ask before approval, as
TypeScript's next step reads them. The `ChangeSnapshot` SHALL hold
`proposal: bool`, whether `proposal.md` exists; `brief: bool`, whether
`brief.md` exists; and `before_approval: Option<String>`.

`before_approval` reads the proposal's body after its frontmatter, as
TypeScript's `parseHumanSteps` does. The `## Human steps` section is the
text after its heading line, matched in any case, up to the next line
starting `## ` or the end. Its lines from a `### Before approval` heading,
matched in any case, up to a `### After landing` heading form the part
before approval, and lines before the first of these headings belong to
neither part here. The part, trimmed, is `None` when it is empty or reads
`None` or `None.` in any case, and otherwise is that trimmed text.
`before_approval` is `None` without a proposal or a `## Human steps`
section.

#### Scenario: Planning facts of change folders
- **WHEN** `read_change` reads the active change folders below
- **THEN** each snapshot holds the row's facts:

| Folder | Files | proposal | brief | before_approval |
|---|---|---|---|---|
| `060-steps` | `proposal.md` whose body holds `## Human steps`, `### Before approval`, `- Set the key.`, `### After landing` and `None`; `brief.md` | true | true | `- Set the key.` |
| `061-none` | `proposal.md` whose body holds `## human steps`, `### before approval` and `None.` | true | false | `None` |
| `062-after` | `proposal.md` whose body holds `## Human steps`, `Tell the team.`, `### After landing` and `- Ship it.`, then `## Delta` and `### Before approval` and `- Not a step.` | true | false | `None` |
| `063-bare` | `brief.md` only | false | true | `None` |

### Requirement: Measured task facts
`read_change` SHALL also give each task's `outcome` the two facts
TypeScript's `deriveMeasuredTask` in `src/core/report/report.ts` reads
from the task's own `<n>.jsonl` stream, beside those of "Task stream
outcomes":

- `start_scope_resolver`: the `scope_resolver` of the same `measures`
  event that gives `start_scope_files`, the first whose phase is `start`;
  none when that event has none or the stream has no such event.
- `measured_ms`: the sum, over the stream's `measures` events in line
  order, of each event whose phase is `end` less the last event whose
  phase is `start` before it and after the previous `end`, in
  milliseconds by each line's timestamp as `timestamp_ms` reads it,
  counting only pairs where both timestamps read and the `end` is not
  earlier than the `start`; none when no pair counts. An `end` with no
  `start` before it since the previous `end` counts for nothing.

A task without a stream gets neither fact.

#### Scenario: Measured facts of task streams
- **WHEN** `read_change` reads an archived change with one task whose stream holds the row's `measures` lines, each written as `<phase> <timestamp>` with an optional scope resolver
- **THEN** the task's outcome has the row's `start_scope_resolver` and `measured_ms`:

| Measures lines | start_scope_resolver | measured_ms |
|---|---|---|
| start `08:00:00.000Z` resolver 2, end `08:07:20.000Z` | 2 | 440000 |
| start `08:00:00.000Z`, end `08:01:00.000Z` | none | 60000 |
| start `08:00:00.000Z` resolver 3, end `08:00:30.000Z`, start `08:10:00.000Z` resolver 2, end `08:10:45.500Z` | 3 | 75500 |
| start `08:00:00.000Z` resolver 2, start `08:05:00.000Z`, end `08:06:00.000Z` | 2 | 60000 |
| start `08:05:00.000Z` resolver 2, end `08:04:00.000Z` | 2 | none |
| end `08:04:00.000Z`, start `08:05:00.000Z` resolver 2 | 2 | none |
| none | none | none |

Every timestamp is on `2026-10-01`, and each line's other fields are the ones the `measures` event type requires.

#### Scenario: Task without a stream has no measured facts
- **WHEN** `read_change` reads an archived change whose one task has no `<n>.jsonl`
- **THEN** the task's outcome has no `start_scope_resolver` and no `measured_ms`

### Requirement: Task outcome query
`task_outcomes(snapshots, ownerships)` in `osq-kernel-storage` SHALL
return one `TaskOutcome` per task of each archived snapshot, in the given
order and then task order, holding exactly the values "Spec table
columns" gives each `task_outcomes` column, as the public fields
`change`, `task`, `capability`, `scope_globs`, `scope_files`,
`verify_kind`, `tests_modify`, `verify_starts`, `shares_scope`,
`position`, `attempts`, `first_attempt`, `dead_reason` and
`files_touched`. Rejected snapshots give no row. `write_task_outcomes`
and `build_read_model` SHALL fill the `task_outcomes` table from these
values, so a feature reads the same rows without SQL (ADR 022).

#### Scenario: Query rows equal the table rows
- **WHEN** `task_outcomes` runs over `read_history` of the spec tables fixture project and the living ownership `read_capability_ownership` reads from its `openspec/specs`
- **THEN** it returns 6 rows, each equal, field by field and in order, to the matching row of `tests/fixtures/spec-tables-rows/task_outcomes.json`

#### Scenario: Rejected snapshots give no outcome
- **WHEN** `task_outcomes` runs over a rejected snapshot that has tasks
- **THEN** it returns no row

### Requirement: Land facts
`read_land_facts(folder: &Path) -> LandFacts` in `osq-kernel-storage` SHALL
read one change folder into the facts a land needs, as TypeScript's
`buildSquashMessage` in `src/core/run/squash-message.ts`, `readLandedAt`,
`listDeltaCapabilities` and `parseStackedOn` read them. It SHALL never
fail: a file that is missing or cannot be read counts as absent, and a line
it cannot use is passed over. `LandFacts` and `LandTask` SHALL be public,
exported from the crate root, and derive `Debug`, `Clone`, `PartialEq`,
`Eq` and `Default`. `LandFacts` SHALL hold:

- `goal: String`: `goal_section` of `markdown_body` of `proposal.md`, or
  the empty string when there is no `proposal.md` or no `## Goal` section.
- `tasks: Vec<LandTask>`: one per item rust-specs `parse_task_list` gives
  for `tasks.md`, in its order, and none without `tasks.md`.
- `base`, `approved` and `approver: Option<String>`: the trimmed text of
  `.run/base`, `.run/approved` and `.run/approver`, and `None` when the
  file is missing or its trimmed text is empty.
- `archived_at: Option<String>`: the `timestamp` of the last line of
  `.run/events/change.jsonl` that parses as a JSON object whose `type` is
  the string `archived` and whose `timestamp` is a string `timestamp_ms`
  accepts, and `None` without one.
- `capabilities: Vec<String>`: the names of the directories directly under
  `specs/`, sorted, and none without `specs/`.
- `stacked_on: Vec<String>`: for each line of `.run/stacked-on` that holds
  at least two words split on whitespace, its first word, in file order.

`LandTask` SHALL hold `number: u32`, the item's number or else its
1-based position in the list; `title: String`, the item's title; `manual:
bool`, true only when `.run/done/<number>` has frontmatter whose `manual`
key is the YAML boolean `true`; and `model` and `version:
Option<String>`, read from the last line of `.run/events/<number>.jsonl`
that parses as a JSON object whose `type` is the string `started` and
whose `data` is an object whose `harness`, `model` and `osqVersion` are
all strings: `model` is `<harness> <model>` and `version` is the
`osqVersion`, and both are `None` without such a line.

#### Scenario: Land facts of an archived change
- **WHEN** `read_land_facts` reads a copy of `tests/fixtures/land-change/001-alpha-orders`, which is `openspec/changes/256-rust-land-feature/fixture/001-alpha-orders` copied byte for byte
- **THEN** it gives these facts:

| Field | Value |
|---|---|
| `goal` | `Orders gain alpha.` |
| `tasks` | number 1, title `When one, two`, manual true, model `pi deepseek/flash`, version `0.3.0`; number 2, title `When three, four`, manual false, model `pi deepseek/flash`, version `0.3.1` |
| `base` | `abc123` |
| `approved` | `sha256:aaaa` |
| `approver` | `Mathias <m@example.invalid>` |
| `archived_at` | `2026-10-20T13:00:00.000Z` |
| `capabilities` | `orders` |
| `stacked_on` | none |

#### Scenario: Land facts pass over what they cannot use
- **WHEN** `read_land_facts` reads a folder holding only the row's files, written with `\n` escapes
- **THEN** it gives `LandFacts::default()` except for the row's facts:

| Files | Facts |
|---|---|
| none, and the folder does not exist | none |
| `proposal.md` holding `---\ntitle: A\n---\n## Verify\n\nx\n` | none |
| `proposal.md` holding `---\ntitle: A\n---\n## Goal\n\n  Ship it.  \n\n## Verify\n\nx\n` | `goal` `Ship it.` |
| `.run/base` holding `  \n` and `.run/approver` holding `\n` | none |
| `.run/approved` holding `  sha256:b  \n` | `approved` `sha256:b` |
| `tasks.md` holding `- [ ] Unnumbered\n- [x] 7. Seven\n` | `tasks` number 1, title `Unnumbered`; number 7, title `Seven`; each manual false, no model, no version |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/done/1` holding `---\nmanual: "true"\n---\n` | `tasks` number 1, title `One`, manual false |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/done/1` holding `manual: true\n` | `tasks` number 1, title `One`, manual false |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/events/1.jsonl` holding `{"type":"started","data":{"harness":"pi","model":"m","osqVersion":"1"}}\n{"type":"started","data":{"harness":"pi","model":7,"osqVersion":"2"}}\nnot json\n` | `tasks` number 1, title `One`, manual false, model `pi m`, version `1` |
| `tasks.md` holding `- [ ] 1. One\n` and `.run/events/1.jsonl` holding `{"type":"finished","data":{"harness":"pi","model":"m","osqVersion":"1"}}\n["started"]\n` | `tasks` number 1, title `One`, manual false, no model, no version |
| `.run/events/change.jsonl` holding `{"type":"archived","timestamp":"2026-10-20T13:00:00.000Z"}\n{"type":"archived","timestamp":"yesterday"}\n{"type":"archived","timestamp":7}\nnot json\n` | `archived_at` `2026-10-20T13:00:00.000Z` |
| `.run/events/change.jsonl` holding `{"type":"archived","timestamp":"2026-10-20T13:00:00.000Z"}\n{"type":"archived","timestamp":"2026-10-21T08:00:00.000Z","data":{}}\n` | `archived_at` `2026-10-21T08:00:00.000Z` |
| `specs/b/spec.md`, `specs/a/spec.md` and `specs/notes.md` | `capabilities` `a`, `b` |
| `.run/stacked-on` holding `001-a sha256:x\nlonely\n\n002-b sha256:y overlap orders\n` | `stacked_on` `001-a`, `002-b` |

### Requirement: Change trees
`change_trees(project_root: &Path, worktrees: &[TreeCandidate],
stacked: &[PathBuf]) -> Vec<ChangeTree>` in `osq-kernel-storage` SHALL give
the trees as TypeScript's `changeTrees` does: a `ChangeTree` is a `root`
and the `folder` it names. First the project root, naming none. Then each
worktree (`path`, `branch`) on `osq/<folder>`, not at the root's real path,
holding `changes/<folder>/.run/approved` or the folder in `archive/` or
`rejected/`. Then each `stacked` folder no worktree names.

#### Scenario: Trees of a project
- **WHEN** `change_trees` reads a project root and the row's worktrees, under a new folder in `CARGO_TARGET_TMPDIR`, with no stacked folders
- **THEN** it returns the project root, then the row's trees:

| Worktree | Branch | Holds | Trees after the root |
|---|---|---|---|
| `wt-a` | `osq/002-b` | `openspec/changes/002-b/.run/approved` | `wt-a` naming `002-b` |
| `wt-a` | `osq/002-b` | `openspec/changes/archive/002-b/` | `wt-a` naming `002-b` |
| `wt-a` | `osq/002-b` | `openspec/changes/002-b/` with no `.run/approved` | none |
| `wt-a` | `main` | `openspec/changes/002-b/.run/approved` | none |
| the project root itself | `osq/002-b` | `openspec/changes/002-b/.run/approved` | none |

#### Scenario: Stacked trees
- **WHEN** `change_trees` reads a project root, a worktree `wt-a` on `osq/002-b` holding an approved `002-b`, and the stacked folders `.stacked/002-b` and `.stacked/003-c`
- **THEN** it returns the project root, `wt-a` naming `002-b`, and `.stacked/003-c` naming `003-c`

### Requirement: Change listing across trees
`list_tree_changes(trees: &[ChangeTree]) -> Vec<ChangeEntry>` SHALL list
every tree's change folders as `list_changes` reads a root, as TypeScript's
`listChanges` does. A tree naming a folder gives only that folder, minus an
archived or rejected entry the first tree also holds there. The first tree
drops an active folder another tree names. Entries sort by location, then
leading number, ties in tree order, and each `path` is in its own tree.

#### Scenario: Changes across trees
- **WHEN** `list_tree_changes` reads the project root holding active `001-a` and `002-b` and archived `000-z`, then a tree naming `002-b` that holds active `002-b` and archived `000-z`, then a tree naming `003-c` that holds archived `003-c`
- **THEN** it returns active `001-a` from the root, active `002-b` from the second tree, archived `000-z` from the root, and archived `003-c` from the third tree, in that order

#### Scenario: Root alone
- **WHEN** `list_tree_changes` reads only the project root tree
- **THEN** it returns what `list_changes` returns for that root

### Requirement: Usage pause record
`read_usage_pause(folder: &Path) -> Option<PauseRecord>` in
`osq-kernel-storage` SHALL read a change folder's `.run/paused.md` as
TypeScript's `readUsagePause` does. `PauseRecord` SHALL be public, exported
from the crate root, derive `Debug`, `Clone`, `PartialEq` and `Eq`, and
hold `task: String`, `until: String`, `source: String` and `error:
Option<String>`. It SHALL return `None` when the file is missing or cannot
be read, when its frontmatter does not parse, when `task` or `until` is
not a string, when `until` is not a timestamp `timestamp_ms` accepts, or
when `source` is not `harness` or `wait`. `error` is the body, trimmed,
and `None` when that is empty or `usage limit reached`.

#### Scenario: Pause records
- **WHEN** `read_usage_pause` reads a scratch change folder whose `.run/paused.md` is `---`, the row's frontmatter lines, `---` and the row's body
- **THEN** it returns the row's record:

| Frontmatter | Body | Record |
|---|---|---|
| `task: "2"`, `until: "2026-10-22T12:30:00.000Z"`, `source: wait` | `usage limit reached\n` | task `2`, until `2026-10-22T12:30:00.000Z`, source `wait`, no error |
| `task: "1"`, `until: 2026-10-23T00:05:00.000Z`, `source: harness` | `  rate limited  \n` | task `1`, until `2026-10-23T00:05:00.000Z`, source `harness`, error `rate limited` |
| `task: "1"`, `until: "2026-10-23T00:05:00.000Z"`, `source: wait` | `\n` | task `1`, until `2026-10-23T00:05:00.000Z`, source `wait`, no error |
| `task: 1`, `until: "2026-10-23T00:05:00.000Z"`, `source: wait` | `usage limit reached\n` | none |
| `task: "1"`, `source: wait` | `usage limit reached\n` | none |
| `task: "1"`, `until: soon`, `source: wait` | `usage limit reached\n` | none |
| `task: "1"`, `until: "2026-10-23T00:05:00.000Z"`, `source: later` | `usage limit reached\n` | none |
| `task: "1"`, `until: "2026-10-23T00:05:00.000Z"` | `usage limit reached\n` | none |
| `task: [` | `usage limit reached\n` | none |

#### Scenario: No pause file
- **WHEN** `read_usage_pause` reads a scratch change folder with no `.run/paused.md`
- **THEN** it returns `None`

### Requirement: Autopilot stop record
`read_autopilot_stop(project_root: &Path) -> Option<AutopilotStop>` in
`osq-kernel-storage` SHALL read `<project_root>/openspec/.run/autopilot-stop.md`
as TypeScript's `readAutopilotStop` does. `AutopilotStop` SHALL be public,
exported from the crate root, derive `Debug`, `Clone`, `PartialEq` and
`Eq`, and hold `reason: String`, `item: String`, `change: Option<String>`,
`command: String`, `at: String` and `detail: Option<String>`. It SHALL
return `None` when the file is missing or cannot be read, when its
frontmatter does not parse, when `reason` is not one of `queue_unreadable`,
`not_approved`, `changed_since_approval`, `rejected`, `plan_refused`,
`planner_not_ready`, `approve_refused`, `halted` and `land_stopped`, when
`item`, `command` or `at` is not a string, or when `change` is present and
not a string. `change` is `None` when the key is absent. `detail` is the
body with one trailing `\n` removed, and `None` when the body, trimmed, is
empty.

#### Scenario: Stop records
- **WHEN** `read_autopilot_stop` reads a scratch project whose `openspec/.run/autopilot-stop.md` is `---`, the row's frontmatter lines, `---` and the row's body, where the base lines are `reason: halted`, `item: stopped-item`, `change: "040"`, `command: osq retry 040 1` and `at: 2026-10-22T10:00:00.000Z`
- **THEN** it returns the row's record:

| Frontmatter | Body | Record |
|---|---|---|
| the base lines | `task 1 died:\n  verify_red\n` | reason `halted`, item `stopped-item`, change `040`, command `osq retry 040 1`, at `2026-10-22T10:00:00.000Z`, detail `task 1 died:\n  verify_red` |
| the base lines without `change` | empty | the first row's record with no change and no detail |
| the base lines | `\n\n` | the first row's record with no detail |
| the base lines | `line\n\n` | the first row's record with detail `line\n` |
| the base lines with `reason: bogus` | empty | none |
| the base lines with `change: 40` | empty | none |
| the base lines with `change: null` | empty | none |
| the base lines without `item` | empty | none |
| the base lines without `command` | empty | none |
| the base lines without `at` | empty | none |
| `reason: [` | empty | none |

#### Scenario: Every stop reason
- **WHEN** `read_autopilot_stop` reads the base lines of "Stop records" with each of `queue_unreadable`, `not_approved`, `changed_since_approval`, `rejected`, `plan_refused`, `planner_not_ready`, `approve_refused`, `halted` and `land_stopped` as the reason, and an empty body
- **THEN** it returns a record with that reason each time

#### Scenario: No stop file
- **WHEN** `read_autopilot_stop` reads a scratch project with no `openspec/.run/autopilot-stop.md`
- **THEN** it returns `None`

### Requirement: After-land failure record
`watch_state_dir(project_root: &Path, home: &Path) -> PathBuf` in
`osq-kernel-storage` SHALL return, as TypeScript's `watchStateDir` does,
`<home>/.osq/watch/<hash>`, where `<hash>` is the lowercase hex SHA-256 of
the project root's canonical path, or of its absolute path when it cannot
be canonicalized, as UTF-8 text.

`read_after_land_failure(project_root: &Path, home: &Path) ->
Option<AfterLandFailure>` SHALL read `after-land.json` in that folder as
TypeScript's `readAfterLandFailure` does. `AfterLandFailure` SHALL be
public, exported from the crate root, derive `Debug`, `Clone`, `PartialEq`
and `Eq`, and hold `change: String`, `command: String`, `exit_code: i64`
and `failed_at: String`. It SHALL return `None` when the file is missing or
cannot be read, when it does not parse as a JSON object, when `change`,
`command` or `failedAt` is not a string, or when `exitCode` is not a whole
number that fits `i64`.

#### Scenario: Watch state folder
- **WHEN** `watch_state_dir` is given the project root `/nonexistent/osq-project` and the home `/home/h`
- **THEN** it returns `/home/h/.osq/watch/84ade4b4937a142d12c5438d1dc81c2e2229362203630b653b27e43e8cc8fcde`

#### Scenario: Watch state folder through a symlink
- **WHEN** `watch_state_dir` is given a symlink to a scratch project folder, and then that folder itself, with the same home
- **THEN** both calls return the same path

#### Scenario: After-land records
- **WHEN** `read_after_land_failure` reads a scratch project and a scratch home whose `watch_state_dir` folder holds an `after-land.json` with the row's text
- **THEN** it returns the row's record:

| `after-land.json` | Record |
|---|---|
| `{"change":"030-shipped","command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | change `030-shipped`, command `pnpm build`, exit code 1, failed at `2026-10-22T10:00:00.000Z` |
| `{"change":"030-shipped","command":"pnpm build","exitCode":"1","failedAt":"2026-10-22T10:00:00.000Z"}` | none |
| `{"command":"pnpm build","exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | none |
| `{"change":"030-shipped","command":5,"exitCode":1,"failedAt":"2026-10-22T10:00:00.000Z"}` | none |
| `{"change":"030-shipped","command":"pnpm build","exitCode":1}` | none |
| `[]` | none |
| `not json` | none |

#### Scenario: No after-land file
- **WHEN** `read_after_land_failure` reads a scratch project and a scratch home with no `after-land.json`
- **THEN** it returns `None`

### Requirement: Queue item titles
`read_queue_titles(project_root: &Path) -> Vec<QueueTitle>` in
`osq-kernel-storage` SHALL read `<project_root>/openspec/queue.md` as
TypeScript's `parseQueue` does, and return one `QueueTitle` per item in
file order. `QueueTitle` SHALL be public, exported from the crate root,
derive `Debug`, `Clone`, `PartialEq` and `Eq`, and hold `slug: String` and
`title: String`. It SHALL return no item when the file is missing or cannot
be read, and when `parseQueue` would throw on any item: a heading line that
starts with `##`, optional spaces or tabs and `[` but is not `## [<slug>]
<title>`, a slug that is not lowercase words of letters and digits joined
by `-`, a repeated slug, a first non-blank line after the heading that is
not `Depends on:` with a value, a dependency or fix that is not a slug,
repeats, or names the item itself or no earlier item, an empty `Fixes:`
line right after `Depends on:`, an empty body, or a body holding a second
`Depends on:` or `Fixes:` line. A title is trimmed, and a `\r` before a
line's `\n` is ignored.

#### Scenario: Queue titles
- **WHEN** `read_queue_titles` reads a scratch project whose `openspec/queue.md` holds the row's text, where `<ok a>` stands for `## [a] A\n\nDepends on: nothing\n\nBody.\n\n`
- **THEN** it returns the row's titles:

| `queue.md` | Titles |
|---|---|
| `# Queue\n\nPreamble.\n\n## [first] First item\n\nDepends on: nothing\n\nBody.\n\n## [second] Second item  \n\nDepends on: first\nFixes: first\n\nBody.\n\n` | `first` titled `First item`, then `second` titled `Second item` |
| `## [first] First\r\n\r\nDepends on: nothing\r\n\r\nBody.\r\n` | `first` titled `First` |
| `##[first] First\n\nDepends on: nothing\n\nBody.\n` | none |
| `## [Bad_Slug] Title\n\nDepends on: nothing\n\nBody.\n` | none |
| `## [first]   \n\nDepends on: nothing\n\nBody.\n` | none |
| `<ok a>## [a] Again\n\nDepends on: nothing\n\nBody.\n` | none |
| `## [first] First\n\nBody.\n` | none |
| `## [first] First\n\nDepends on:\n\nBody.\n` | none |
| `## [first] First\n\nDepends on: later\n\nBody.\n` | none |
| `## [first] First\n\nDepends on: first\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: a, a\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: A\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes:\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes: later\n\nBody.\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes: a, a\n\nBody.\n` | none |
| `## [first] First\n\nDepends on: nothing\n\n` | none |
| `## [first] First\n\nDepends on: nothing\n\nBody.\n\nDepends on: nothing\n` | none |
| `<ok a>## [b] B\n\nDepends on: nothing\nFixes: a\n\nBody.\n  Fixes: a\n` | none |

#### Scenario: No queue file
- **WHEN** `read_queue_titles` reads a scratch project with no `openspec/queue.md`
- **THEN** it returns no item

### Requirement: Retry context
`read_retry_context(folder: &Path, task: &str) -> RetryContext` in
`osq-kernel-storage` SHALL read, as TypeScript's `readRetryContext` does,
the lines of `<folder>/.run/events/<task>.jsonl` in file order, passing
over a blank line and one that is not a JSON object. `RetryContext` SHALL
be public, exported from the crate root, derive `Debug`, `Clone`,
`PartialEq` and `Eq`, and hold `attempt: u64`, `reason: Option<String>`
and `output: Option<String>`. Starting from attempt 1 with neither:

- a `retry` line takes its data's `attempt` when that is a whole number
  that fits `u64`, its `reason` when that is a non-empty string, and sets
  the output to the body of `.run/dead/<task>.<attempt - 1>.md`, after
  `markdown_body` and with ANSI escape codes removed, or to none when that
  file cannot be read;
- a `recertification` line whose data's `outcome` is `requeued` takes its
  `attempt` and `reason` the same way, and its `output` when that is a
  string;
- every other line changes nothing.

A missing event file gives attempt 1. At the end an empty reason or output
is `None`. An ANSI escape code is ESC `[`, any of `0-9`, `;` and `?`, any
characters from space to `/`, and one from `@` to `~`; or ESC `]`, any
characters but BEL, and BEL or ESC `\`.

#### Scenario: Retry contexts
- **WHEN** `read_retry_context` reads task `1` of a scratch change folder whose `.run/events/1.jsonl` holds the row's lines, each followed by a newline, and whose `.run/dead/` holds the row's markers, where `retry <n>` is a `retry` event with the data `{"target":"1","reason":"verify_red","attempt":<n>}`, `requeued {...}` is a `recertification` event whose data is `{"task":"1","outcome":"requeued","differingPaths":["src/a.rs"],"attribution":{},"command":"cargo test","exitCode":1,"timedOut":false,"recordedHash":"a","currentHash":"b"}` with the fields in braces added, `passed {...}` is the same with the outcome `passed`, and `<marker>` is `---\nreason: verify_red\n---\nerror: one\n`
- **THEN** it returns the row's context:

| Lines | Markers | Attempt | Reason | Output |
|---|---|---|---|---|
| no event file | none | 1 | none | none |
| `retry 2` | `1.1.md` holding `<marker>` | 2 | `verify_red` | `error: one\n` |
| `retry 2` | none | 2 | `verify_red` | none |
| `retry 2` | `1.1.md` holding `---\nreason: verify_red\n---\n` ESC `[31merror` ESC `[0m: red\n` ESC `]8;;http://x` BEL `link` ESC `]8;;` BEL `\n` | 2 | `verify_red` | `error: red\nlink\n` |
| `requeued {"attempt":3,"reason":"scope_regression","output":"fail\n"}` | none | 3 | `scope_regression` | `fail\n` |
| `passed {"attempt":5,"reason":"scope_regression","output":"fail\n"}` | none | 1 | none | none |
| `retry 2`, `requeued {"attempt":3,"output":"x"}` | `1.1.md` holding `<marker>` | 3 | `verify_red` | `x` |
| `requeued {"attempt":2,"reason":"scope_regression","output":"fail"}`, `retry 3` | none | 3 | `verify_red` | none |
| `retry 2`, `requeued {"attempt":3,"reason":"scope_regression"}` | `1.1.md` holding `<marker>` | 3 | `scope_regression` | `error: one\n` |
| an empty line, `not json`, `[1]`, three spaces, `retry 2` | `1.1.md` holding `no frontmatter\n` | 2 | `verify_red` | `no frontmatter\n` |
| a `retry` event with the data `{"target":"1","reason":"verify_red","attempt":2.5}` | `1.0.md` holding `---\nreason: verify_red\n---\nzero\n` | 1 | `verify_red` | `zero\n` |
| a `retry` event with the data `{"target":"1","reason":"","attempt":2}` | none | 2 | none | none |
| `requeued {"attempt":2,"output":""}` | none | 2 | none | none |
| `requeued {"attempt":2,"output":"  \n"}` | none | 2 | none | `  \n` |

### Requirement: Change folder files
`read_change_files(folder: &Path) -> ChangeFiles` in `osq-kernel-storage`
SHALL read the files of one change folder that TypeScript's
`checkLocks`, `checkArchives` and `checkDoneMarkers` read, and SHALL never
fail. `ChangeFiles`, `LockFile` and `DoneMarker` SHALL be public, exported
from the crate root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`.

`ChangeFiles` holds:

- `has_proposal: bool`, whether `proposal.md` or `spec.md` exists in the
  folder, as a file, a folder or anything else.
- `has_tasks: bool`, whether `tasks` or `tasks.md` exists in the folder, as
  a file, a folder or anything else.
- `locks: Vec<LockFile>`, one per entry of `.run/running` whose name ends
  `.pid`, then one per entry of `.run/locks` whose name ends `.pid`, each
  folder's names in byte order. A missing folder adds none.
- `done_markers: Vec<DoneMarker>`, one per entry of `.run/done`, in byte
  order of the names. A missing folder adds none.

`LockFile` holds `path: PathBuf`, the folder's path joined with the
entry's relative path, and `pid: Option<i64>`, the `pid` member of the
file's JSON object when that member is a JSON integer, and `None` when the
entry cannot be read as text, is not a JSON object, or has no integer `pid`.

`DoneMarker` holds `path: PathBuf`, the folder's path joined with the
entry's relative path, and `verified: bool`, true when the entry reads as
text, its frontmatter parses through rust-specs `parse_frontmatter`, and
either `scope_hash` is a string, or `manual` is the boolean `true` and
`reason` is a string.

#### Scenario: Lock pids
- **WHEN** `read_change_files` reads a scratch change folder whose `.run/running/1.pid` holds the row's text
- **THEN** `locks` is one `LockFile` with that path and the row's pid:

| Text | Pid |
|---|---|
| `{"pid":4242,"startedAt":1}` | `Some(4242)` |
| `{"pid":-1}` | `Some(-1)` |
| `{"pid":"4242"}` | `None` |
| `{"pid":1.5}` | `None` |
| `{}` | `None` |
| `[4242]` | `None` |
| `not json` | `None` |

#### Scenario: Done marker kinds
- **WHEN** `read_change_files` reads a scratch change folder whose `.run/done/1.md` holds the row's text
- **THEN** `done_markers` is one `DoneMarker` with that path and the row's verified value:

| Text | Verified |
|---|---|
| `---\nscope_hash: abc\n---\n` | `true` |
| `---\nscope_hash: "12"\n---\n` | `true` |
| `---\nscope_hash: 12\n---\n` | `false` |
| `---\nmanual: true\nreason: checked by hand\n---\n` | `true` |
| `---\nmanual: "true"\nreason: checked by hand\n---\n` | `false` |
| `---\nmanual: true\n---\n` | `false` |
| `---\nmanual: true\nreason: 3\n---\n` | `false` |
| `---\nreason: checked by hand\n---\n` | `false` |
| `done\n` | `false` |
| `---\nscope_hash: [\n---\n` | `false` |

#### Scenario: Change folder file order and presence
- **WHEN** `read_change_files` reads a scratch change folder holding the row's entries, each file written with the text `{"pid":1}` unless the row says otherwise
- **THEN** it returns the row's facts, paths written relative to the folder:

| Entries | Facts |
|---|---|
| none | `has_proposal` false, `has_tasks` false, no locks, no done markers |
| `proposal.md`, `tasks/1.md` | `has_proposal` true, `has_tasks` true, no locks, no done markers |
| `spec.md`, `tasks.md` | `has_proposal` true, `has_tasks` true, no locks, no done markers |
| folder `proposal.md`, folder `tasks.md` | `has_proposal` true, `has_tasks` true, no locks, no done markers |
| `.run/running/2.pid`, `.run/running/10.pid`, `.run/running/notes.txt`, `.run/locks/1.pid`, folder `.run/running/3.pid` | locks `.run/running/10.pid` pid `Some(1)`, `.run/running/2.pid` pid `Some(1)`, `.run/running/3.pid` pid `None`, `.run/locks/1.pid` pid `Some(1)` |
| `.run/done/2.md` text `done`, `.run/done/10.md` text `done`, folder `.run/done/3.md` | done markers `.run/done/10.md`, `.run/done/2.md`, `.run/done/3.md`, each verified `false` |

### Requirement: Now facts
`read_now_facts(folder: &Path) -> NowFacts` in `osq-kernel-storage` SHALL
read the files of one change folder that TypeScript's `readChangeFolder`
reads to give each task its current status, and SHALL never fail.
`NowFacts` and `NowTask` SHALL be public, exported from the crate root, and
derive `Debug`, `Clone`, `PartialEq` and `Eq`.

`NowFacts` holds:

- `has_proposal: bool`, whether `proposal.md` or `spec.md` exists in the
  folder, following symlinks.
- `tasks: Vec<NowTask>`, one per entry of the folder's `tasks/` whose name
  ends `.md`, of any kind, in byte order of the names. A missing `tasks/`
  adds none.

`NowTask` holds, where `<n>` is the entry's name without `.md`:

- `id: String`, `<n>`.
- `done: bool`, whether an entry `.run/done/<n>` exists, of any kind.
- `manual: bool`, true when `.run/done/<n>` reads as text, its frontmatter
  parses through rust-specs `parse_frontmatter`, and its `manual` is the
  boolean `true`.
- `dead: bool`, whether an entry `.run/dead/<n>.md` exists, of any kind.
- `regressed: bool`, whether an entry `.run/regressed/<n>.md` exists, of
  any kind.
- `running: bool`, whether an entry `.run/running/<n>.pid` exists, of any
  kind, whatever it holds.

A marker whose name is not one of these, such as `.run/dead/3.1.md` or
`.run/regressed/change.md`, belongs to no task. Tests build each folder
under `CARGO_TARGET_TMPDIR`, since `.run/running/` and `*.pid` files are
not committed.

#### Scenario: Now facts of a change folder
- **WHEN** `read_now_facts` reads a scratch change folder holding `proposal.md`, `tasks/1.md`, `tasks/10.md`, `tasks/2.md`, `tasks/3.md`, a folder `tasks/4.md`, `tasks/notes.txt`, `.run/done/1` holding `---\nmanual: true\n---\n`, `.run/done/2` holding `---\nmanual: "true"\nreason: by hand\n---\n`, `.run/done/3` holding `done\n`, a folder `.run/done/4`, `.run/dead/2.md`, `.run/dead/3.1.md`, `.run/regressed/3.md`, `.run/regressed/change.md` and `.run/running/10.pid` holding `not json\n`
- **THEN** `has_proposal` is true and `tasks` is, in this order:

| Id | Done | Manual | Dead | Regressed | Running |
|---|---|---|---|---|---|
| `1` | true | true | false | false | false |
| `10` | false | false | false | false | true |
| `2` | true | false | true | false | false |
| `3` | true | false | false | true | false |
| `4` | true | false | false | false | false |

#### Scenario: Now facts edges
- **WHEN** `read_now_facts` reads a scratch change folder holding only the row's entries
- **THEN** it returns the row's facts:

| Entries | Facts |
|---|---|
| none | `has_proposal` false, no tasks |
| `spec.md`, `tasks/1.md` | `has_proposal` true, task `1` with every flag false |
| `tasks/1.md`, `.run/done/1` holding `---\nmanual: [\n---\n` | `has_proposal` false, task `1` done, not manual |
| `proposal.md`, `tasks/1.md`, `.run/done/1` holding `---\nmanual: true\nreason: 3\n---\n` | `has_proposal` true, task `1` done and manual |
| `proposal.md`, `tasks.md` | `has_proposal` true, no tasks |

### Requirement: Watch state records
`read_watch_state(project_root: &Path, home: &Path) -> WatchState` in
`osq-kernel-storage` SHALL read, as TypeScript's `readWatchState` does,
`service.json` and `watcher.json` in `watch_state_dir(project_root, home)`,
and whether `watch.log` exists there. `WatchState`, `ServiceRecord`,
`WatcherRecord` and `WatcherMode` SHALL be public, exported from the crate
root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`. `WatchState` holds
`service: Option<ServiceRecord>`, `watcher: Option<WatcherRecord>`,
`log: PathBuf`, the folder's `watch.log` whether or not it exists, and
`log_exists: bool`. `ServiceRecord` holds `pid: u64`, `started_at: String`
and `log: String`. `WatcherRecord` holds `pid: u64`, `mode: WatcherMode`
(`Background` or `Terminal`, read from `background` and `terminal`),
`version: String`, `commit: String`, `started_at: String` and
`waiting: Option<String>`.

A record SHALL be `None` when its file is missing or cannot be read, when it
does not parse as a JSON object, when a field TypeScript's
`isServiceRecord` or `isWatcherRecord` checks is missing or of another type
(`waiting` may be a string or `null`, and `pid` must be a whole number that
fits `u64`), or when its `pid` names no live process: a pid of 0, or one
with no `/proc/<pid>` folder.

#### Scenario: Watch records
- **WHEN** `read_watch_state` reads a scratch project and a scratch home whose `watch_state_dir` folder holds the row's files, where `<live>` is the test process's own pid and `<dead>` is 2147483646
- **THEN** it returns the row's service and watcher, a `log` that is `watch.log` in that folder, and the row's `log_exists`:

| Files | Service | Watcher | `log_exists` |
|---|---|---|---|
| none | none | none | false |
| `watcher.json` `{"pid":<live>,"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}` | none | pid `<live>`, `Terminal`, `0.3.0`, `abc1234`, `s`, no waiting | false |
| `service.json` `{"pid":<live>,"startedAt":"s","log":"l"}`, `watcher.json` `{"pid":<live>,"mode":"background","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":"w"}`, `watch.log` | pid `<live>`, `s`, `l` | pid `<live>`, `Background`, waiting `w` | true |
| `watcher.json` `{"pid":<dead>,"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}` | none | none | false |
| `watcher.json` `{"pid":<live>,"mode":"daemon","version":"0.3.0","commit":"abc1234","startedAt":"s","waiting":null}` | none | none | false |
| `watcher.json` `{"pid":<live>,"mode":"terminal","version":"0.3.0","commit":"abc1234","startedAt":"s"}` | none | none | false |
| `service.json` `{"pid":"<live>","startedAt":"s","log":"l"}` | none | none | false |
| `service.json` `not json` | none | none | false |

### Requirement: Validator failing record
`validator_failing(snapshots: &[ChangeSnapshot]) -> Option<ValidatorFailing>`
in `osq-kernel-storage` SHALL pick, as TypeScript's `readValidatorFailing`
does, the failing validator run of the archived changes. Its runs are every
`validator_ran` event of the snapshots whose location is archived, from
their event facts, whose outcome is not `not_run`, in snapshot order and
event order, then sorted stably by timestamp, a timestamp that does not
read as one counting as 0. When the last run's outcome is `failed`,
`timed_out` or `unreadable`, it returns that run's change folder, its
outcome, the number of runs from the end in a row whose outcome is one of
those three, and its error: the first line of its output that is not blank,
trimmed, or the outcome's text when there is none. Otherwise it returns
`None`. `ValidatorFailing` SHALL be public, exported from the crate root,
derive `Debug`, `Clone`, `PartialEq` and `Eq`, and hold `change: String`,
`outcome: ValidatorOutcome`, `runs: usize` and `error: String`.

#### Scenario: Validator failing runs
- **WHEN** `validator_failing` reads the snapshots of a scratch project whose only changes are the archived changes `201-v` and `202-w`, whose change streams hold the row's `validator_ran` events, given as outcome, timestamp and output
- **THEN** it returns the row's record:

| `201-v` runs | `202-w` runs | Record |
|---|---|---|
| `failed` at `2026-10-01T10:00:00.000Z` with `boom` | none | `201-v`, `failed`, 1, `boom` |
| `failed` at `2026-10-03T10:00:00.000Z` with no output | `unreadable` at `2026-10-02T10:00:00.000Z` with `x` | `201-v`, `failed`, 2, `failed` |
| `timed_out` at `2026-10-01T10:00:00.000Z` with `slow` | `validated` at `2026-10-02T10:00:00.000Z` | none |
| `validated` at `2026-10-01T10:00:00.000Z` | `failed` at `2026-10-02T10:00:00.000Z` with the output `\n  late  \nmore`, then `not_run` at `2026-10-03T10:00:00.000Z` | `202-w`, `failed`, 1, `late` |
| none | none | none |

### Requirement: Task history
`read_task_history(folder: &Path, task: &str) -> TaskHistory` in
`osq-kernel-storage` SHALL read the lines of
`<folder>/.run/events/<task>.jsonl` in file order as TypeScript's report
reads a task stream. It skips a line that is blank after trimming and one
that is not a JSON object, and it gives an all-zero `TaskHistory` when the
file is missing or cannot be read. An event's type is its `type` member,
and its data is its `data` member when that is a JSON object, else none.
A number counts only when it is a finite JSON number.

`TaskHistory` SHALL be public, exported from the crate root, derive
`Debug`, `Clone`, `PartialEq` and `Default`, and hold:

- `attempts: u64`, the number of `started` events;
- `unexplained: u64`, the `started` events that follow an earlier
  `started` with no `dead` or `regressed` event between them;
- `dead_reasons: Vec<String>`, one entry per `dead` event in file order:
  its data's `reason`, trimmed, when that is a string that is not blank,
  else `unknown`;
- `verify_codes: Vec<Option<f64>>`, one entry per `verify_ran` event
  whose data's `phase` is not `pre_spawn`, in file order: its data's
  `exitCode` when that is a number, else `None`;
- `pre_spawn: PreSpawnHistory`, counted from the `verify_ran` events
  whose data's `phase` is `pre_spawn`;
- `costs: Vec<f64>`, every event's data `cost` that is a number, in file
  order, from events of any type;
- `cost_reported_attempts: u64`, the attempts holding a cost. An attempt
  runs from one `started` event to the next. A cost before the first
  `started` belongs to no attempt;
- `automatic: RetryGroup` and `manual: RetryGroup`, the attempts that
  `retry` events open. Each `retry` event opens an attempt that runs to
  the next `retry` event or the end of the file. The attempt is automatic
  when the data's `automatic` is exactly `true`, else manual;
- `stuck: u64`, the number of `stuck` events;
- `scope: ScopeHistory`, counted from `regressed` and `recertification`
  events.

`PreSpawnHistory` SHALL hold `runs`, `mismatches`, `missing_path_runs`
and `red`, `green` and `any`, each a `StartCount` of `runs` and `passed`,
all `u64`. A pre-spawn run counts in `runs`. It counts in `mismatches`
when its data's `mismatch` is exactly `true`, and in `missing_path_runs`
when its data's `missingPaths` is a non-empty array. When its data's
`expected` is exactly `red`, `green` or `any`, it counts in that start's
`runs`, and in its `passed` when its data's `exitCode` is the number 0.

`RetryGroup` SHALL hold `count: u64`, `reached_done: u64`, `cost: f64`
and `cost_reported_attempts: u64`. Each retry-opened attempt adds 1 to its
group's `count`. A first `done` event inside it adds 1 to `reached_done`,
and every later `done` in it changes nothing. The data `cost` of any event
inside it, except `retry`, `stuck` and `done` events, is added to the
group's `cost` in file order, and the attempt's first such cost adds 1 to
`cost_reported_attempts`.

`ScopeHistory` SHALL hold `detected`, `passed_at_detection`,
`failed_at_detection`, `recertified_by_human`,
`recertified_automatically` and `requeued_for_agent`, all `u64`. A
`regressed` event whose data's `reason` is `scope_regression` counts in
`detected`. It also counts in `passed_at_detection` when its data's
`exitCode` is the number 0, and in `failed_at_detection` when that is any
other number. A `recertification` event whose data's `outcome` is `passed`
counts in `recertified_automatically` when its data's `automatic` is
exactly `true`, else in `recertified_by_human`. One whose outcome is
`requeued` counts in `requeued_for_agent`.

#### Scenario: Task histories
- **WHEN** `read_task_history` reads task `1` of a scratch change folder whose `.run/events/1.jsonl` holds the row's lines, each followed by a newline, where `<type> <data>` is the line `{"type":"<type>","timestamp":"2026-10-21T08:00:00.000Z","data":<data>}` and `<type>` alone has the data `{}`
- **THEN** it returns the row's history, and every field the row leaves out is zero or empty:

| Lines | History |
|---|---|
| no event file | all zero |
| `started`, `started` | attempts 2, unexplained 1 |
| `started`, `dead {"reason":" timeout "}`, `started`, `regressed {"reason":"verify_red"}`, `started` | attempts 3, dead reasons `timeout` |
| `dead {"reason":"  "}`, `dead {"reason":7}`, `dead` | dead reasons `unknown`, `unknown`, `unknown` |
| `verify_ran {"exitCode":1}`, `verify_ran`, `verify_ran {"exitCode":"0"}`, `verify_ran {"exitCode":2.5}` | verify codes 1, none, none, 2.5 |
| `verify_ran {"phase":"pre_spawn","expected":"red","exitCode":0,"mismatch":true,"missingPaths":["a"]}`, `verify_ran {"phase":"pre_spawn","expected":"green","exitCode":1,"missingPaths":[]}`, `verify_ran {"phase":"pre_spawn","expected":"any","exitCode":0,"mismatch":"yes"}`, `verify_ran {"phase":"pre_spawn","expected":"blue","exitCode":0}` | pre-spawn runs 4, mismatches 1, missing path runs 1, red 1 passed of 1, green 0 passed of 1, any 1 passed of 1 |
| `tokens {"cost":0.5}`, `started {"cost":0.1}`, `tokens {"cost":0.2}`, `started`, `done {"cost":"1"}`, `started`, `tokens {"cost":0.3}` | attempts 3, unexplained 2, costs 0.5, 0.1, 0.2, 0.3, cost reported attempts 2 |
| `tokens {"cost":9}`, `retry {"automatic":true}`, `started {"cost":0.25}`, `done`, `done`, `retry`, `stuck`, `tokens {"cost":0.5}`, `tokens {"cost":0.5}`, `retry {"automatic":"true"}`, `done {"cost":2}` | attempts 1, costs 9, 0.25, 0.5, 0.5, 2, cost reported attempts 1, automatic count 1, reached done 1, cost 0.25, cost reported attempts 1, manual count 2, reached done 1, cost 1, cost reported attempts 1, stuck 1 |
| `regressed {"reason":"scope_regression","exitCode":0}`, `regressed {"reason":"scope_regression","exitCode":3}`, `regressed {"reason":"scope_regression"}`, `regressed {"reason":"verify_red","exitCode":0}`, `recertification {"outcome":"passed","automatic":true}`, `recertification {"outcome":"passed"}`, `recertification {"outcome":"passed","automatic":"true"}`, `recertification {"outcome":"requeued"}`, `recertification` | scope detected 3, passed at detection 1, failed at detection 1, recertified by human 2, recertified automatically 1, requeued for agent 1 |
| an empty line, `not json`, `[1]`, three spaces, `{"type":"started","data":[1]}`, `{"type":"dead","data":"x"}` | attempts 1, dead reasons `unknown` |

### Requirement: Rejection planner
`read_rejection_planner(folder: &Path) -> Option<String>` in
`osq-kernel-storage` SHALL return `None` unless
`<folder>/.run/events/change.jsonl` holds a line that is a JSON object
whose `type` is `rejected`. It skips blank lines and lines that are not
JSON objects, as `read_task_history` does. When there is such a line, it
SHALL return the `planner` string of `<folder>/brief.md`'s frontmatter as
`frontmatter_string` reads it, trimmed, when that is not blank, and
`unknown` otherwise.

#### Scenario: Rejection planners
- **WHEN** `read_rejection_planner` reads a scratch change folder holding the row's `change.jsonl` lines, each followed by a newline, and the row's `brief.md`
- **THEN** it returns the row's result:

| Lines | Brief | Result |
|---|---|---|
| no event file | `---\nplanner: claude-opus\n---\n` | none |
| `{"type":"archived","timestamp":"2026-10-21T08:00:00.000Z","data":{}}` | `---\nplanner: claude-opus\n---\n` | none |
| `{"type":"rejected","timestamp":"2026-10-21T08:00:00.000Z","data":{"reason":"x"}}` | `---\nplanner: " claude-opus "\n---\n` | `claude-opus` |
| `not json`, `{"type":"rejected"}` | none | `unknown` |
| `{"type":"rejected"}` | `---\nplanner: 7\n---\n` | `unknown` |
| `{"type":"rejected"}` | `---\nplanner: "  "\n---\n` | `unknown` |

### Requirement: Task sizes
`read_task_sizes(folder: &Path) -> Vec<TaskSize>` in `osq-kernel-storage`
SHALL give the measured tasks of one change folder, as TypeScript's
`projectMeasuredTasks` in `src/core/report/report.ts` measures them. It
lists the names in `<folder>/tasks/` that end in `.md`, ordered by leading
number when both names have one that differs, else by bytes, and takes
each name without `.md` as the task id. A missing `tasks/` folder gives no
task. Each task's stream `<folder>/.run/events/<task>.jsonl` is read as
rust-storage "Task history" reads one: blank lines and lines that are not
a JSON object are skipped, a type is the `type` member and data the `data`
member when that is an object. An event's timestamp is its `timestamp`
member when that is a string `timestamp_ms` reads. A task whose stream is
missing or cannot be read gives no entry, and so does a task whose stream
has no start measure.

The start measure is the first `measures` event whose data's `phase` is
`start` and whose data's `scopeFiles` is a finite number of at least 0.
`TaskSize` SHALL be public, exported from the crate root, derive `Debug`,
`Clone` and `PartialEq`, and hold:

- `task: String`, the task id;
- `title: String` and `acceptance_lines: usize`, the title and the number
  of acceptance items of `tasks/<task>.md` as `parse_task_file` in
  `osq-kernel-specs` reads them; an empty title and 0 when the file cannot
  be read or does not parse;
- `scope_files: f64`: the number of keys of the data's `scopeHashes` of
  the last `measures` event whose phase is `end` and whose `scopeHashes`
  is a JSON object, else the start measure's `scopeFiles`;
- `resolver: ScopeResolver`, from the start measure's data
  `scopeResolver`: `Legacy` when the member is absent, `Second` when it is
  the number 2, and `Other` for any other value, `null` included;
- `attempts: u64`, the number of `started` events;
- `first_attempt_pass: bool`, true when a `done` event comes after the
  first `started` event and before any later `started`, `dead` or
  `regressed` event;
- `duration_ms: Option<i64>`: going through the `measures` events in file
  order, each whose phase is `start` sets the open start to its timestamp,
  or to none without one. Each whose phase is `end` adds its timestamp less
  the open start when both are known and the end is not earlier, then
  clears the open start. It is none when no `end` added anything, and
  `Some(0)` when only zero lengths were added.

`ScopeResolver` SHALL be a public enum with the unit variants `Legacy`,
`Second` and `Other`, exported from the crate root, deriving `Debug`,
`Clone`, `Copy`, `PartialEq` and `Eq`.

#### Scenario: Task sizes of task streams
- **WHEN** a test writes a change folder with one task file `tasks/1.md`, titled `When one runs, it passes` with three acceptance items, and the row's lines in `.run/events/1.jsonl`, each line written as `<type> <timestamp> <data>` with every timestamp on `2026-10-20`, then calls `read_task_sizes` on the folder
- **THEN** it gives the row's single `TaskSize`, with task `1`, that title and 3 acceptance lines, or no entry for `none`:

| Lines | scope_files | resolver | attempts | first_attempt_pass | duration_ms |
|---|---|---|---|---|---|
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":2}`, started `08:00:01.000Z`, done `08:01:00.000Z`, measures `08:01:00.000Z` `{"phase":"end"}` | 2 | `Legacy` | 1 | true | 60000 |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":3,"scopeResolver":2}`, started `08:00:05.000Z`, done `08:30:00.000Z`, measures `08:30:00.000Z` `{"phase":"end","scopeHashes":{"a":"1","b":"2","c":"3","d":"4","e":"5","f":"6","g":"7","h":"8","i":"9"}}` | 9 | `Second` | 1 | true | 1800000 |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":1,"scopeResolver":3}`, started `08:00:01.000Z`, done `08:06:00.000Z` | 1 | `Other` | 1 | true | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":1,"scopeResolver":null}`, started `08:00:01.000Z` | 1 | `Other` | 1 | false | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":5}`, started `08:00:01.000Z`, dead `08:02:00.000Z`, measures `08:02:00.000Z` `{"phase":"end"}`, the line `not json`, started `08:10:00.000Z`, measures `08:10:00.000Z` `{"phase":"start","scopeFiles":6}`, done `08:12:00.000Z`, measures `08:12:30.000Z` `{"phase":"end"}` | 5 | `Legacy` | 2 | false | 270000 |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":-1}`, measures `08:00:01.000Z` `{"phase":"start","scopeFiles":4}`, started `08:00:02.000Z`, regressed `08:00:03.000Z`, done `08:00:04.000Z` | 4 | `Legacy` | 1 | false | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":2}`, measures `08:00:00.000Z` `{"phase":"end","scopeHashes":["a"]}`, started `08:00:01.000Z`, done `08:00:02.000Z` | 2 | `Legacy` | 1 | true | 0 |
| measures `08:05:00.000Z` `{"phase":"start","scopeFiles":2}`, measures `08:04:00.000Z` `{"phase":"end"}`, measures `bad` `{"phase":"start","scopeFiles":2}`, measures `08:06:00.000Z` `{"phase":"end"}` | 2 | `Legacy` | 0 | false | none |
| started `08:00:00.000Z`, done `08:01:00.000Z` | none | none | none | none | none |
| measures `08:00:00.000Z` `{"phase":"start","scopeFiles":"2"}` | none | none | none | none | none |

#### Scenario: Task files without a measured stream
- **WHEN** a test writes a change folder with the task files `10.md`, `2.md`, `notes.txt` and `3.md`, where `2` and `10` have the stream of the first row of "Task sizes of task streams", `3` has none, and `10.md` holds `not a task`, then calls `read_task_sizes` on it, and also calls it on a folder with no `tasks/` folder
- **THEN** the first call gives the tasks `2` and then `10`, where `2` has the title `When one runs, it passes` and 3 acceptance lines and `10` has an empty title and 0 acceptance lines, and the second call gives no task

### Requirement: Dependencies added
`read_dependencies_added(folder: &Path) -> Vec<DependencyPair>` in
`osq-kernel-storage` SHALL give the distinct packages one change folder's
tasks added, as TypeScript's `collectDependencies` reads them for one
folder. It reads every file in `<folder>/.run/events/` whose name is
digits and `.jsonl`, as rust-storage "Task history" reads a stream. Each
`dependencies_added` event's data `added`, when it is an array, gives one
pair for each entry that is a JSON object whose `file` and `name` are
strings that are not blank after JavaScript's `trim`; the pair holds them
trimmed. Equal pairs count once, and the pairs are sorted by `file` and
then by `name`, by bytes. A missing folder gives none.

`DependencyPair` SHALL be public, exported from the crate root, derive
`Debug`, `Clone`, `PartialEq` and `Eq`, and hold `file: String` and
`name: String`.

#### Scenario: Dependencies of task streams
- **WHEN** a test writes a change folder whose `.run/events/` holds the row's files, each holding `dependencies_added` events with the given `added` data, then calls `read_dependencies_added` on it
- **THEN** it gives the row's pairs, each written as `<name> (<file>)`, in order:

| Event files | Pairs |
|---|---|
| `1.jsonl`: `[{"file":"package.json","name":"zod"},{"file":"package.json","name":"zod"},{"file":" Cargo.toml ","name":" serde "},{"file":"","name":"empty-file"},{"file":"Cargo.toml","name":7},"bad"]`; `2.jsonl`: `[{"file":"Cargo.toml","name":"anyhow"}]` | `anyhow (Cargo.toml)`, `serde (Cargo.toml)`, `zod (package.json)` |
| `1.jsonl`: `{"file":"Cargo.toml","name":"serde"}`, which is not an array | none |
| `change.jsonl` and `1.json`: `[{"file":"Cargo.toml","name":"serde"}]` | none |
| `1.jsonl`: the line `not json`, then `[{"file":"b","name":"x"},{"file":"a","name":"y"}]` | `y (a)`, `x (b)` |
| no `.run/events/` folder | none |

### Requirement: Change fixes
`read_change_fixes(folder: &Path) -> Vec<String>` in `osq-kernel-storage`
SHALL give the change ids a change folder names in `fixes`, as
TypeScript's `parseSpecMdFromFolder` reads them. It reads
`<folder>/proposal.md`, or `<folder>/spec.md` when there is no
`proposal.md`, with `parse_proposal` in `osq-kernel-specs`, and gives its
`fixes` in order. No file, an unreadable file or one that does not parse
gives none.

#### Scenario: Fixes of change folders
- **WHEN** a test writes the row's files into a new change folder and calls `read_change_fixes` on it
- **THEN** it gives the row's ids:

| Files | Fixes |
|---|---|
| `proposal.md` with `fixes: [201, "201"]` | `201`, `201` |
| `proposal.md` with `fixes: [1, abc]` | `001`, `abc` |
| `proposal.md` without `fixes` | none |
| `spec.md` with `fixes: [7]` | `007` |
| `proposal.md` without `fixes` and `spec.md` with `fixes: [7]` | none |
| `proposal.md` holding `---` then `fixes: [` then `---` | none |
| no file | none |

### Requirement: Result disclosure reader
`read_result_disclosures(folder: &Path) -> Vec<TaskDisclosure>` in
`osq-kernel-storage` SHALL be public, exported from the crate root, and
give the disclosures of one change folder that rust-storage "Result
disclosures" gives `read_change`'s snapshot, in the same order.

#### Scenario: Disclosure reader on the files fixture
- **WHEN** a test calls `read_result_disclosures` on `archive/001-told` and `archive/002-silent` of the files fixture project
- **THEN** the first gives the three disclosures that "Disclosures of the files fixture" lists, in its order, and the second gives none

### Requirement: Task scope hash
`task_scope_hash(project: &Path, scope: &[String]) -> ScopeHash` in
`osq-kernel-storage` SHALL resolve a task's scope and hash its files as
TypeScript's `resolveScope` and `computeTaskScopeHash` do, and SHALL never
fail. `ScopeHash` and `ScopeFile` SHALL be public, exported from the crate
root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`. `ScopeHash` holds
`hash: String` and `files: Vec<ScopeFile>`; `ScopeFile` holds `path:
String`, the project-relative POSIX path, and `hash: Option<String>`.

Each `scope` entry is trimmed, its `\` turned into `/` and its leading
`./` removed, repeatedly. An entry holding `*` or `?`, or ending in `/`, is
a pattern; any other entry is exact.

- A pattern searches below its root: the part before its first `*` or `?`
  up to its last `/`, or the project when that part has no `/`, or for an
  entry with neither the entry without its trailing `/`. A root that is
  `..`, starts with `../` or is absolute gives nothing. Otherwise the
  pattern gives every regular file below the root, symbolic links not
  followed, whose project-relative path rust-specs `scope_covers_path`
  matches with the entry, and a pattern that matches no file gives nothing.
- An exact entry that starts with `/` or `../`, or is `..`, gives itself
  with no hash. Otherwise it gives itself with the hash of the regular
  file at that path, or no hash when that path is not a regular file or
  is a symbolic link.

The first result for a path wins, and `files` is sorted by path bytes. A
file's hash is `sha256:` and the lowercase hex SHA-256 of its text read as
UTF-8 with invalid bytes replaced, or no hash when it cannot be read.
`hash` is `sha256:` and the lowercase hex SHA-256 of one line
`<path>:<hash>` per file, with an empty hash for no hash, joined with a
newline.

Tests read `tests/fixtures/scope-project/`, whose `src/` is
`crates/features/retry/tests/fixtures/recert-project/src/` copied byte for
byte.

#### Scenario: Scope hash of a task's entries
- **WHEN** `task_scope_hash` runs on a new copy of `tests/fixtures/scope-project/` with the row's entries
- **THEN** it gives the row's `hash`, and `files` holds the row's paths and hashes in this order, where `-` is no hash:

| Entries | `hash` | `files` |
|---|---|---|
| `../outside.txt` | `sha256:985bc8dcecaee4913c191e1d3b327a931d48951f486500edd41ab73a57918030` | `../outside.txt` - |
| `/abs/file.txt` | `sha256:d84705e84283af54e8d2e9a3d8f1a7f34c018c3aeb577b80d8186dd3577d841a` | `/abs/file.txt` - |
| `../*.txt`, `/abs/*.txt` | `sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | none |
| `src` | `sha256:7aaf195b39732b39c116a660cd4ffe54eae09e8fc8a4970b2d7e295e68ad4892` | `src` - |
| `src/missing.txt` | `sha256:1806de8892c7ca6bae45404c910a7d99b7218bbdbb988a01339e809e98c0f1dc` | `src/missing.txt` - |
| `.\src\one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `src/one.txt` `sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| `src/one.txt`, `./src/one.txt` | `sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` | `src/one.txt` `sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae` |
| ` src/two/a.txt ` | `sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7` |
| `src/two/*` | `sha256:30f9c1fbb55d70fb0e7a241e42ceb8099db0c1fe1d5e8fe749159a2b7964bb7d` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7` |
| `src/two/deep/?.txt` | `sha256:3515f8747e9ad61510ae928351f0d194a568fb85538f2a36a8cf865bcc42f53a` | `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/two/` | `sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/two/**/*.txt` | `sha256:aa7da01efad91002a86deb7638a3a1648fea7b55632fc4b30e17e1bb57d74342` | `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |
| `src/**` | `sha256:d21bc7711678dcf1a2bd9bc1c5e7be5282b4baa70f6d001ba39ab0937d5ef4ac` | `src/one.txt` `sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae`, `src/two/a.txt` `sha256:87428fc522803d31065e7bce3cf03fe475096631e5e07bbd7a0fde60c4cf25c7`, `src/two/deep/b.txt` `sha256:0263829989b6fd954f72baaf2fc64bc2e2f01d692d4de72986ea808f6e99813f` |

### Requirement: Done marker scope
`read_done_scope(folder: &Path, task: &str) -> Option<DoneScope>` in
`osq-kernel-storage` SHALL read the scope a task's done marker
`<folder>/.run/done/<task>` records, as TypeScript's `readDoneMarker`
does, and SHALL never fail. `DoneScope` SHALL be public, exported from the
crate root, and derive `Debug`, `Clone`, `PartialEq` and `Eq`. It holds
`scope_hash: String` and `scope_files: BTreeMap<String, Option<String>>`.

It SHALL give `None` when the marker cannot be read as text, when its
frontmatter does not parse through rust-specs `parse_frontmatter`, or when
`scope_hash` is not a non-empty string. Otherwise `scope_hash` is that
string, and `scope_files` holds one entry per key of a `scope_files`
mapping, the key as text (an integer key as its decimal text) and the value
when it is a string, else `None`; `scope_files` is empty when the key is
missing or not a mapping.

`differing_scope_paths(recorded: &BTreeMap<String, Option<String>>,
current: &ScopeHash) -> Vec<String>` in `osq-kernel-storage` SHALL give
the paths whose hash differs, as TypeScript's `findDifferingPaths` does:
for each path in `recorded` or in `current.files`, in byte order and once
each, where a path missing from one side counts as no hash there, it gives
nothing when both hashes are equal, and otherwise `<path> (added)` when the
recorded side has no hash, `<path> (deleted)` when the current side has
none, and `<path> (modified)` else.

#### Scenario: Done marker scope reads
- **WHEN** `read_done_scope` reads task `1` of a scratch change folder whose `.run/done/1` holds the row's text, written with `\n` escapes
- **THEN** it gives the row's result:

| Marker | Result |
|---|---|
| `---\nscope_hash: sha256:aa\nscope_files:\n  src/a.txt: sha256:1\n  src/b.txt: null\n  7: sha256:7\n  src/c.txt: 3\n---\nx\n` | `scope_hash` `sha256:aa`; `scope_files` `7` `sha256:7`, `src/a.txt` `sha256:1`, `src/b.txt` none, `src/c.txt` none |
| `---\nscope_hash: sha256:aa\nscope_files: [a]\n---\n` | `scope_hash` `sha256:aa`; no `scope_files` |
| `---\nscope_hash: sha256:aa\n---\n` | `scope_hash` `sha256:aa`; no `scope_files` |
| `---\nscope_hash: ""\n---\n` | `None` |
| `---\nscope_hash: 5\n---\n` | `None` |
| `no frontmatter\n` | `None` |
| `---\nscope_hash: [\n---\n` | `None` |
| no file | `None` |

#### Scenario: Differing scope paths
- **WHEN** `differing_scope_paths` compares the recorded `b.txt` `sha256:1`, `a.txt` `sha256:2`, `c.txt` none and `d.txt` `sha256:4` with a `ScopeHash` whose `files` are `a.txt` `sha256:9`, `c.txt` `sha256:3`, `d.txt` `sha256:4` and `e.txt` with no hash
- **THEN** it gives `a.txt (modified)`, `b.txt (deleted)` and `c.txt (added)`, in that order

### Requirement: Done marker refresh
`refresh_done_marker(folder: &Path, task: &str, recorded_hash: &str,
current: &ScopeHash, now: &str) -> Result<(), DoneMarkerError>` in
`osq-kernel-storage` SHALL rewrite `<folder>/.run/done/<task>` after a
passing recertification, as TypeScript's `refreshRecertifiedDoneMarker`
does. `DoneMarkerError` SHALL be public, exported from the crate root,
derive `Debug`, `Clone`, `PartialEq` and `Eq`, and implement `Display` and
`std::error::Error`; its display is `cannot read <path>: <io error>` when
the marker cannot be read, `line <n>: <message>` when its frontmatter does
not parse through rust-specs `parse_frontmatter`, and `cannot write
<path>: <io error>` when it cannot be written, where `<path>` is the
marker's path.

The rewrite SHALL keep the marker's body and every frontmatter key in its
place. It sets `original_scope_hash` to `recorded_hash` when that key is
not a non-empty string, then `scope_hash` to `current.hash`, `scope_files`
to a mapping of each of `current.files`' paths to its hash or null,
`scope_resolver` to 2, `recertified_at` to `now`, and
`recertification_count` to one more than its value when that is an integer
above 0, or 1. A key the marker lacks is added at the end in that order.
The marker is written as `---`, a newline, the frontmatter, `---`, a
newline and the body.

The frontmatter SHALL be written as the `yaml` package's `stringify`
writes it: one `<key>: <value>` line per key; a non-empty mapping or list
as a block on the lines below its key, indented two more spaces; a list
item as `- ` and its value, where a mapping or list item starts on the
dash's line and its later lines are indented two past the dash; `{}` for
an empty mapping, `[]` for an empty list, `null`, `true`, `false`, an
integer in decimal and a float as its source text. A key is written as a
string, an integer key as its decimal text. A string is written plain
when it is not empty, starts with an ASCII letter or digit, `.`, `_` or
`/`, holds only ASCII letters and digits and `.`, `_`, `/`, `-`, `+`, `:`
and `@`, does not end with `:`, and is not `null`, `Null`, `NULL`, `true`,
`True`, `TRUE`, `false`, `False`, `FALSE`, an integer, a `0o` octal or
`0x` hex integer, a float such as `1.5`, `.5` or `12e45`, `.inf`, `.Inf`,
`.INF`, `.nan`, `.NaN` or `.NAN`; any other string is written as a JSON
string.

#### Scenario: Refreshed marker text
- **WHEN** a scratch change folder's `.run/done/4` holds `---`, `scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, the row's frontmatter lines, `---` and `2026-10-01T10:00:00.000Z`, each line followed by a newline, and `refresh_done_marker` runs for task `4` with that recorded hash, `task_scope_hash` of a new copy of `tests/fixtures/scope-project/` with the entry `src/one.txt`, and the time `2026-10-24T08:00:00.000Z`
- **THEN** the marker's lines start with `---`, `scope_hash: sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06` and the row's lines:

| Frontmatter lines | Lines |
|---|---|
| `flag: true` | `flag: true` |
| `note: ""` | `note: ""` |
| `stamp: "0x1f"` | `stamp: "0x1f"` |
| `stamp: "12e45"` | `stamp: "12e45"` |
| `stamp: "-1"` | `stamp: "-1"` |
| `stamp: "True"` | `stamp: "True"` |
| `stamp: "a:"` | `stamp: "a:"` |
| `stamp: a.b/c_d-e+f:g@h` | `stamp: a.b/c_d-e+f:g@h` |
| `stamp: 1.2.3` | `stamp: 1.2.3` |
| `nothing:` | `nothing: null` |
| `list: [{a: 1, b: [x]}, [y, z], {}, []]` | `list:`, `  - a: 1`, `    b:`, `      - x`, `  - - y`, `    - z`, `  - {}`, `  - []` |
| `nested: {a: {b: c}}` | `nested:`, `  a:`, `    b: c` |
| `codes: {7: seven}` | `codes:`, `  "7": seven` |
| `recertification_count: 0` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `recertification_count: "3"` | `recertification_count: 1`, `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222` |
| `original_scope_hash: ""` | `original_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222`, `scope_files:` |
| `recertification_count: 4`, `original_scope_hash: sha256:1111` | `recertification_count: 5`, `original_scope_hash: sha256:1111`, `scope_files:` |

#### Scenario: Refreshed marker tail
- **WHEN** `refresh_done_marker` runs as "Refreshed marker text" runs it with the frontmatter line `flag: true`
- **THEN** the marker is `---\nscope_hash: sha256:3cfb4fa0947b1fa72f558e0825b1115022423a0aeea283d1bef4ae6536db3a06\nflag: true\noriginal_scope_hash: sha256:2222222222222222222222222222222222222222222222222222222222222222\nscope_files:\n  src/one.txt: sha256:7ebb69bac93710c46aa44d35d31ef4965e35c47dd614e1305bfd4a9f96a411ae\nscope_resolver: 2\nrecertified_at: 2026-10-24T08:00:00.000Z\nrecertification_count: 1\n---\n2026-10-01T10:00:00.000Z\n`, written with `\n` escapes

#### Scenario: Marker that cannot refresh
- **WHEN** `refresh_done_marker` runs for task `4` of a scratch change folder whose `.run/done/4` is the row's
- **THEN** it gives a `DoneMarkerError` whose display starts with the row's text and leaves the folder's files as they were:

| Marker | Display starts |
|---|---|
| missing | `cannot read <folder>/.run/done/4: ` |
| `---\nscope_hash: [\n---\n` | `line ` |
| a folder | `cannot read <folder>/.run/done/4: ` |

### Requirement: Planning token models
`planning_token_models(folder: &Path) -> Vec<String>` in
`osq-kernel-storage`, exported from the crate root, SHALL return the models
of a change folder's planning sessions that recorded tokens, as
TypeScript's `findUnpricedPlanningModels` finds them before it drops the
priced ones. It reads `<folder>/.run/plan.jsonl`; a missing or unreadable
file gives no models.

As TypeScript's `parsePlanRecords` reads the file, each line that is not
blank is parsed as JSON, and it is a record only when it is an object
whose `type` is `plan_started` or `plan_exited`, whose `sessionId` and
`timestamp` are non-empty strings, and whose `data` is an object. Any
other line is skipped. As `correlatePlanSessions` does, the records form
sessions by `sessionId`: a session's start is its first `plan_started`
record and its exit its first `plan_exited` record.

A session counts when its start's `data.model` is a non-empty string and
its exit recorded tokens. An exit recorded tokens when its
`data.usage.inputTokens` or `data.usage.outputTokens` is a finite number
of 0 or more, or when its `data.slice` is a valid slice whose
`tokens.input` or `tokens.output` is a finite number of 0 or more. As
TypeScript's `parsePlanningSlice` reads it, a slice is valid when it is an
object whose `start`, `end` and `approvedAt` are non-empty strings, whose
`turns` and `activeMinutes` are finite numbers of 0 or more, whose
`tokens` is an object, and whose `costSource` is absent, `null`,
`harness` or `price_table`.

The result is the models of the sessions that count, each once, sorted by
bytes.

#### Scenario: Planning token models of a folder
- **WHEN** `planning_token_models` reads a scratch change folder whose `.run/plan.jsonl` holds the row's lines, where `S(<id>, <model>)` stands for `{"type":"plan_started","sessionId":"<id>","timestamp":"2026-01-01T00:00:00Z","data":{"harness":"claude","model":"<model>"}}`, `E(<id>, <data>)` for `{"type":"plan_exited","sessionId":"<id>","timestamp":"2026-01-01T00:01:00Z","data":<data>}`, and `<slice>` for `"start":"a","end":"b","approvedAt":"c","turns":1,"activeMinutes":2`
- **THEN** it returns the row's models:

| Lines | Models |
|---|---|
| no file | none |
| `S(s1, m-b)`, `E(s1, {"usage":{"inputTokens":5}})`, `S(s2, m-a)`, `E(s2, {"usage":{"outputTokens":0}})`, `S(s3, m-b)`, `E(s3, {"usage":{"inputTokens":1}})` | `m-a`, `m-b` |
| `S(s1, m)`, `E(s1, {"usage":{}})` | none |
| `S(s1, m)` | none |
| `S(s1, m)`, `E(s1, {"usage":{"inputTokens":-1,"outputTokens":"5"}})` | none |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"output":3},"costSource":null}})` | `m` |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"input":3},"costSource":"price_table"}})` | `m` |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"input":3},"costSource":"guess"}})` | none |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{"start":"a","end":"b","approvedAt":"","turns":1,"activeMinutes":2,"tokens":{"input":3}}})` | none |
| `S(s1, m)`, `E(s1, {"usage":{},"slice":{<slice>,"tokens":{"input":null,"reasoning":4}}})` | none |
| `S(s1, )`, `E(s1, {"usage":{"inputTokens":5}})` | none |
| `S(s1, first)`, `S(s1, second)`, `E(s1, {"usage":{}})`, `E(s1, {"usage":{"inputTokens":5}})` | none |
| `S(s1, first)`, `S(s1, second)`, `E(s1, {"usage":{"inputTokens":5}})` | `first` |
| `not json`, blank line, `{"type":"plan_started","sessionId":"","timestamp":"t","data":{"model":"x"}}`, `{"type":"plan_ready","sessionId":"s9","timestamp":"t","data":{}}`, `S(s1, m)`, `E(s1, {"usage":{"outputTokens":2}})` | `m` |

### Requirement: Durable write
`write_durable(path: &Path, bytes: &[u8]) -> std::io::Result<()>` in
`osq-kernel-storage` SHALL replace the file at `path` with `bytes` so that a
crash leaves either the old file or the new one, as ADR 030 says. It writes
`bytes` to `.<file name>.tmp` in the same folder, calls `sync_all` on it,
renames it over `path`, and on Unix opens the folder and calls `sync_all`
on it. It creates no folder. When a step fails it returns that error, and
removes the temporary file when the rename did not happen.

#### Scenario: Durable writes
- **WHEN** `write_durable` writes `new\n` to the row's path in a new folder under `CARGO_TARGET_TMPDIR`
- **THEN** it gives the row's result, and the folder holds no `.<file name>.tmp` afterwards:

| Path | Before | Result |
|---|---|---|
| `cursor` in the folder | no file | `Ok`, and `cursor` holds `new\n` |
| `cursor` in the folder | `cursor` holding `old\n` | `Ok`, and `cursor` holds `new\n` |
| `missing/cursor` in the folder | no `missing` folder | an `Err` of kind `NotFound`, and no `missing` folder |
| `cursor` in the folder | `cursor` is a folder | an `Err`, and `cursor` is still a folder |
