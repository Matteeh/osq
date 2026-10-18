## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Read model tables
`write_read_model(db_path, snapshots)` SHALL write a SQLite database holding
the tables `changes`, `tasks` and `dead_attempts`, the nine tables of "Event
table columns" and the two of "File table columns", created with untyped
columns named as TypeScript's `osq query` names them. `changes`, `tasks`,
`dead_attempts` and `disclosures` SHALL hold rows of archived snapshots in
the given order; a rejected snapshot adds rows to `notices` only.
`build_read_model(project_root, db_path)` SHALL read the trial labels, read
the archived and rejected changes with `read_history`, write them, fill the
labels, and add the manual edit records.

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
`dead_attempts`, the nine event tables and `disclosures` SHALL equal the rows
TypeScript's `osq query --json` printed for them, committed as JSON fixtures
under `crates/kernel/storage/tests/golden/`. Text and null SHALL be equal as
written and numbers equal by value. The comparisons are corpus tests:
`tests/archive_corpus.rs` for the first three tables,
`tests/history_corpus.rs` for the event tables and `tests/files_corpus.rs`
for `disclosures`. The fixture rows of "Read model tables", "History fixture
rows" and "Files fixture rows" are their fast counterparts.

#### Scenario: Golden rows
- **WHEN** the read model is written from this repository's archive and its rows for folders numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the 194 rows of `changes.json`, the 665 rows of `tasks.json` and the 50 rows of `dead_attempts.json`

#### Scenario: Golden event table rows
- **WHEN** `build_read_model` builds the read model of this repository and the rows of the nine event tables whose `change` is numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the rows of the same-named JSON files: 44 in `recertifications.json`, 251 in `notices.json`, 50 in `validator_runs.json`, 1 in `link_findings.json`, and none in `pauses.json`, `focused_runs.json`, `mutation_picks.json`, `mutation_survivors.json` and `validator_findings.json`

#### Scenario: Golden disclosure rows
- **WHEN** `build_read_model` builds the read model of this repository and the `disclosures` rows whose `change` is numbered 014 to 209 are read in table order
- **THEN** they equal, row by row, the 661 rows of `tests/golden/files/disclosures.json`
