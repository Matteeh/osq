## MODIFIED Requirements

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
