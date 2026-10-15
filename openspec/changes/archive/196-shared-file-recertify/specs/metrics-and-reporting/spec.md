## ADDED Requirements

### Requirement: Recertification query table
`osq query` SHALL also build `recertifications(change, task, recertified_at,
outcome, automatic, path, credited_to, source)` on every call, of archived
changes in folder order, from the change files, reading event streams through
the index, and store it nowhere. It SHALL hold one row per attribution entry of
each `recertification` event in each task stream of a change, in numeric
order, and in the entry's order within the event. A task stream is a file
whose name is digits and `.jsonl`.

- `change` is the folder name.
- `task` and `outcome` are the event's `data.task` and `data.outcome`.
- `recertified_at` is the event's `timestamp`.
- `automatic` is `1` when `data.automatic` is `true`, else `0`.
- `path` and `credited_to` are the entry's `path` and `attribution`.
- `source` is `measures` when the entry carries `source: "measures"`, else
  `file_changed` when `credited_to` is a task number, else null.

An event without object `data`, or whose `data.attribution` is not an array,
SHALL add no row; an entry that is not an object SHALL add no row, and a field
of the wrong type SHALL read as null. `osq query` without a statement SHALL
list the table after `pauses`, with its columns, as the last line.

#### Scenario: Recertifications of one archived change
- **WHEN** the archive holds `007-pricing`, whose `1.jsonl` holds a `recertification` event at `2026-10-15T10:00:00.000Z` with task `1`, outcome `passed`, `automatic: true`, and attribution `[{ path: "src/a.ts (modified)", attribution: "2", source: "measures" }, { path: "src/b.ts (modified)", attribution: "3" }]`, and whose `2.jsonl` holds a `recertification` event at `2026-10-15T11:00:00.000Z` with task `2`, outcome `requeued`, no `automatic` key, and attribution `[{ path: "src/c.ts (deleted)", attribution: "unknown" }]`
- **THEN** `recertifications` holds exactly these rows:

| change | task | recertified_at | outcome | automatic | path | credited_to | source |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `007-pricing` | `1` | `2026-10-15T10:00:00.000Z` | `passed` | `1` | `src/a.ts (modified)` | `2` | `measures` |
| `007-pricing` | `1` | `2026-10-15T10:00:00.000Z` | `passed` | `1` | `src/b.ts (modified)` | `3` | `file_changed` |
| `007-pricing` | `2` | `2026-10-15T11:00:00.000Z` | `requeued` | `0` | `src/c.ts (deleted)` | `unknown` | null |

#### Scenario: No recertifications
- **WHEN** no archived change holds a `recertification` event
- **THEN** `osq query "select count(*) as n from recertifications"` prints `n` and `0`

#### Scenario: Recertifications listed
- **WHEN** `osq query` runs without a statement
- **THEN** it prints `recertifications(change, task, recertified_at, outcome, automatic, path, credited_to, source)` as the last line, directly after the `pauses` line, and exits zero

## MODIFIED Requirements

### Requirement: Pause query table
`osq query` SHALL also build `pauses(change, task, paused_at, until, source)`
on every call, of archived changes in folder order, from the change files,
reading event streams through the index, and store it nowhere. It SHALL hold
one row per `paused` event in each task stream of a change, in numeric order.
A task stream is a file whose name is digits and `.jsonl`.

- `change` is the folder name.
- `task` is the event's `data.task`.
- `paused_at` is the event's `timestamp`.
- `until` and `source` are the event's `data.until` and `data.source`.

An event without object `data` SHALL add no row, and a field of the wrong type
SHALL read as null. `osq query` without a statement SHALL list the table after
`task_outcomes`, with its columns.

#### Scenario: Pauses of one archived change
- **WHEN** the archive holds `007-pricing`, whose `2.jsonl` holds a `started` event, then a `paused` event at `2026-10-14T12:00:00.000Z` with task `2`, until `2026-10-14T15:00:00.000Z` and source `harness`, then a `paused` event at `2026-10-14T15:01:00.000Z` with task `2`, until `2026-10-14T15:31:00.000Z` and source `wait`
- **THEN** `pauses` holds exactly these rows:

| change | task | paused_at | until | source |
| --- | --- | --- | --- | --- |
| `007-pricing` | `2` | `2026-10-14T12:00:00.000Z` | `2026-10-14T15:00:00.000Z` | `harness` |
| `007-pricing` | `2` | `2026-10-14T15:01:00.000Z` | `2026-10-14T15:31:00.000Z` | `wait` |

#### Scenario: No pauses
- **WHEN** no archived change holds a `paused` event
- **THEN** `osq query "select count(*) as n from pauses"` prints `n` and `0`

#### Scenario: Pauses listed
- **WHEN** `osq query` runs without a statement
- **THEN** it prints `pauses(change, task, paused_at, until, source)` directly after the `task_outcomes` line, and exits zero
