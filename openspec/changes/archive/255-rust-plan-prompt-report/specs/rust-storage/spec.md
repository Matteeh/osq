## ADDED Requirements

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
