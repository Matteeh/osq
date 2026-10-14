## ADDED Requirements

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
- **THEN** it prints `pauses(change, task, paused_at, until, source)` as the last line, after `task_outcomes`, and exits zero

## MODIFIED Requirements

### Requirement: Task outcome query table
`osq query` SHALL also build `task_outcomes(change, task, capability,
scope_globs, scope_files, verify_kind, tests_modify, verify_starts,
shares_scope, position, attempts, first_attempt, dead_reason, files_touched)`
on every call, one row per `tasks/<n>.md` of each archived change, in folder
and numeric task order, from the change files, reading event streams through
the index, and store it nowhere. `osq query` without a statement SHALL list it
after `link_findings`, with its columns. The columns hold what the plan
decided and what happened:

- `change` is the folder name and `task` the task file's number, as in `tasks`.
- `capability` is the living capability whose Code ownership covers the most
  of the task's resolved scope files, the first by name on a tie, and null
  when none covers one. The resolved scope files are the keys of the
  `scopeHashes` of the task's last `measures` end event that carries them;
  without one, `capability` is null.
- `scope_globs` is the number of `scope` entries in the task file.
- `scope_files` is the task's scope size as "Repository task-size outcome
  history" defines it, and null when the task has no valid start measure.
- `verify_kind` reads the task's `verify` command. A test file token is a
  whitespace-separated token, with quotes stripped, whose base name holds
  `.test.` or `.spec.`; a token holding `*` counts as two. The kind is `one`
  for exactly one distinct test file token, `several` for more, `suite` for
  none when the command equals the proposal frontmatter's `verify`, and
  `other` otherwise.
- `tests_modify` is 1 when the task sets `tests.modify: true`, else 0.
- `verify_starts` is `red`, `green` or `any`, as the task parser reads it.
- `shares_scope` is 1 when a `scope` entry of the task equals a `scope` entry
  of a lower-numbered task of the same change, else 0.
- `position` is the task's 1-based place among the change's task files.
- `attempts` is the same count as `tasks.attempts`.
- `first_attempt` is 1 when the first attempt ended with `done` before another
  `started`, `dead` or `regressed` event, else 0.
- `dead_reason` is the reason of the task's last dead attempt, as
  `dead_attempts` records it, and null when it has none.
- `files_touched` is the `changedFiles` of the task's last `measures` end
  event, and null when it has none.

#### Scenario: Task outcomes of one archived change
- **WHEN** the archive holds `030-widgets`, whose proposal `verify` is `pnpm verify`; whose living specs give capability `widgets` `src/**` and capability `gadgets` `tests/**`; whose task 1 has scope `src/a.ts`, `tests/a.test.ts`, verify `node --test tests/a.test.ts`, and a stream with one `started`, a start measure with `scopeFiles` 2, an end measure with `scopeHashes` for `src/a.ts`, `src/b.ts` and `tests/a.test.ts` and `changedFiles` 3, then `done`; whose task 2 has scope `src/a.ts`, `tests/b.test.ts`, `tests/c.test.ts`, `tests.modify: true`, `verify_starts: green`, verify `node --test tests/b.test.ts tests/c.test.ts`, and a stream with `started`, a start measure with `scopeFiles` 3, `dead` with reason `verify_red`, `started`, an end measure with `scopeHashes` for those three files and `changedFiles` 2, then `done`; and whose task 3 has scope `scripts/x.mjs`, verify `pnpm verify`, and no stream
- **THEN** `task_outcomes` holds exactly these rows:

| task | capability | scope_globs | scope_files | verify_kind | tests_modify | verify_starts | shares_scope | position | attempts | first_attempt | dead_reason | files_touched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1` | `widgets` | 2 | 3 | `one` | 0 | `red` | 0 | 1 | 1 | 1 | null | 3 |
| `2` | `gadgets` | 3 | 3 | `several` | 1 | `green` | 1 | 2 | 2 | 0 | `verify_red` | 2 |
| `3` | null | 1 | null | `suite` | 0 | `red` | 0 | 3 | 0 | 0 | null | null |

#### Scenario: Verify kinds
- **WHEN** a task's `verify` is each command below and its proposal's `verify` is `pnpm verify`
- **THEN** its `verify_kind` is the kind beside it:

| verify | verify_kind |
| --- | --- |
| `node --import tsx --import ./tests/git-test-env.ts --test tests/a.test.ts` | `one` |
| `pnpm test tests/a.test.ts tests/a.test.ts` | `one` |
| `node --test tests/a.test.ts tests/b.spec.ts` | `several` |
| `node --test 'tests/*.test.ts'` | `several` |
| `pnpm verify` | `suite` |
| `node scripts/check.mjs` | `other` |

#### Scenario: Task outcomes listed
- **WHEN** `osq query` runs without a statement
- **THEN** it prints `task_outcomes(change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched)` directly after `link_findings`, and exits zero
