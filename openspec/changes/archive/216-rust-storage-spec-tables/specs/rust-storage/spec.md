## ADDED Requirements

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

## MODIFIED Requirements

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
