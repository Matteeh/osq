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
the tables `changes`, `tasks` and `dead_attempts`, the nine tables of "Event
table columns", the two of "File table columns" and the two of "Spec table
columns", created with untyped columns named as TypeScript's `osq query`
names them. `changes`, `tasks`, `dead_attempts`, `disclosures` and
`requirements` SHALL hold rows of archived snapshots in the given order; a
rejected snapshot adds rows to `notices` only. `build_read_model(project_root,
db_path)` SHALL read the trial labels, read the archived and rejected changes
with `read_history`, write them, fill the labels, add the manual edit
records, and fill `task_outcomes` with `write_task_outcomes`, using the
ownership rust-specs `read_capability_ownership` reads from
`openspec/specs/`.

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
`read_change` SHALL read the `notices` record of `.run/manifest.json`. The
record is present only when `notices` is an object whose `items` is an array.
Its items keep, in order, the entries that are objects with a string `id` and
a string `severity`. Its opened ids are the string entries of `opened` when
`opened` is an array, and absent otherwise.

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
as bytes, and pass each relative path, with `/` separators, and its bytes to
rust-core's `compute_seal`. A file or folder it cannot read SHALL be a
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
