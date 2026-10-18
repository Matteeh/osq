## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Read model tables
`write_read_model(db_path, snapshots)` SHALL write a SQLite database holding
the tables `changes`, `tasks` and `dead_attempts`, and the nine tables of
"Event table columns", created with untyped columns named as TypeScript's
`osq query` names them. `changes`, `tasks` and `dead_attempts` SHALL hold one
set of rows per archived snapshot in the given order; a rejected snapshot
adds rows to `notices` only. Each column SHALL follow the rule in the
scenarios below. `build_read_model(project_root, db_path)` SHALL read the
trial labels, read the archived and rejected changes with `read_history`,
write them, and then fill the labels.

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

### Requirement: TypeScript row parity
For the archived changes 014 to 209, the rows of `changes`, `tasks`,
`dead_attempts` and the nine event tables SHALL equal the rows TypeScript's
`osq query --json` printed for them, committed as JSON fixtures under
`crates/kernel/storage/tests/golden/`. Text and null SHALL be equal as
written and numbers equal by value. The comparisons are corpus tests:
`tests/archive_corpus.rs` for the first three tables and
`tests/history_corpus.rs` for the event tables. The fixture rows of "Read
model tables" and "History fixture rows" are their fast counterparts.

#### Scenario: Golden rows
- **WHEN** the read model is written from this repository's archive and its rows for folders numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the 194 rows of `changes.json`, the 665 rows of `tasks.json` and the 50 rows of `dead_attempts.json`

#### Scenario: Golden event table rows
- **WHEN** `build_read_model` builds the read model of this repository and the rows of the nine event tables whose `change` is numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the rows of the same-named JSON files: 44 in `recertifications.json`, 251 in `notices.json`, 50 in `validator_runs.json`, 1 in `link_findings.json`, and none in `pauses.json`, `focused_runs.json`, `mutation_picks.json`, `mutation_survivors.json` and `validator_findings.json`
