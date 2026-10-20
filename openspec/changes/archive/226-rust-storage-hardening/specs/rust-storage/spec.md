## ADDED Requirements

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

## MODIFIED Requirements

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
`write_task_outcomes` writes.

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
