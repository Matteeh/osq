## ADDED Requirements

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
- **THEN** it prints `task_outcomes(change, task, capability, scope_globs, scope_files, verify_kind, tests_modify, verify_starts, shares_scope, position, attempts, first_attempt, dead_reason, files_touched)` as the last line, after `link_findings`, and exits zero

### Requirement: What history says in the plan prompt
When `task_outcomes` holds at least `planning.history.minimumTasks` rows with
one or more attempts, the plan prompt SHALL carry a `## What history says`
section after `## This repository's record` and before any
`## Recent executor disclosures`; otherwise the section SHALL be absent and
the prompt unchanged. Its statistics SHALL cover the window of the
`planning.history.recentTasks` most recent of those rows, by change folder
numeric id and then task number, newest first. Its body SHALL be these lines
in this order:

```
Counts from the last <n> archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.
First attempt by scope files: 1-2 <passed>/<tasks>, 3-4 <passed>/<tasks>, 5-8 <passed>/<tasks>, over 8 <passed>/<tasks>
First attempt by verify kind: one <passed>/<tasks>, several <passed>/<tasks>, suite <passed>/<tasks>, other <passed>/<tasks>
First attempt by tests.modify: true <passed>/<tasks>, false <passed>/<tasks>
First attempt by shared scope: shared <passed>/<tasks>, not shared <passed>/<tasks>
First attempt by position: first task <passed>/<tasks>, later task <passed>/<tasks>
Most common last dead reasons: <reason> <tasks>, <reason> <tasks>, <reason> <tasks>
```

`<n>` is the window's row count, `<passed>` its rows with `first_attempt` 1
in the group, and `<tasks>` its rows in the group. A group with no row SHALL
be left out of its line, and a line with no group left SHALL be left out; a
null `scope_files` row is in no scope group. The dead reason line SHALL name
at most three `dead_reason` values by row count, highest first and then by
name, and read `Most common last dead reasons: none` when the window has none.
The body SHALL hold at most `planning.history.maxCharacters` characters,
counting each newline: lines are kept in order until the next would pass the
limit, and the section is absent when the first line alone does not fit.

`minimumTasks`, `recentTasks` and `maxCharacters` SHALL default to 30, 100 and
1500 and be positive integers; a partial `planning.history` block keeps the
other defaults, and an invalid value SHALL fail configuration loading naming
`planning.history.<key>`. osq SHALL never block, warn, or write a lint
finding, notice or event from these numbers.

#### Scenario: Too little history
- **WHEN** `task_outcomes` holds fewer rows with an attempt than `planning.history.minimumTasks`
- **THEN** the plan prompt has no `## What history says` section and is byte for byte the prompt without it

#### Scenario: Counted window
- **WHEN** `minimumTasks` is 2 and `recentTasks` is 4, and the archive's rows with an attempt are, oldest first, `040-a` task 1 (scope_files 2, `one`, tests_modify 0, shares_scope 0, position 1, first_attempt 1), `040-a` task 2 (4, `several`, 1, 1, 2, 0, dead_reason `verify_red`), `041-b` task 1 (1, `one`, 0, 0, 1, 1), `041-b` task 2 (9, `suite`, 0, 0, 2, 0, `crashed`), and `041-b` task 3 (6, `one`, 0, 0, 3, 0, `verify_red`)
- **THEN** the section's body is exactly:

| line |
| --- |
| `Counts from the last 4 archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.` |
| `First attempt by scope files: 1-2 1/1, 3-4 0/1, 5-8 0/1, over 8 0/1` |
| `First attempt by verify kind: one 1/2, several 0/1, suite 0/1` |
| `First attempt by tests.modify: true 0/1, false 1/3` |
| `First attempt by shared scope: shared 0/1, not shared 1/3` |
| `First attempt by position: first task 1/1, later task 0/3` |
| `Most common last dead reasons: verify_red 2, crashed 1` |

#### Scenario: Character cap
- **WHEN** the window of "Counted window" is formatted with `maxCharacters` equal to the length of its first two lines plus one newline
- **THEN** the body is exactly its first two lines

#### Scenario: Section placement
- **WHEN** the archive has enough rows and a recent change holds a real disclosure
- **THEN** every planning mode's prompt has `## What history says` after `## This repository's record` and before `## Recent executor disclosures`

#### Scenario: Invalid history configuration
- **WHEN** `planning.history.minimumTasks`, `recentTasks` or `maxCharacters` is zero, negative, or not an integer
- **THEN** configuration loading fails naming the key

## MODIFIED Requirements

### Requirement: Trial query tables
`osq query` SHALL also build these six tables on every call, of archived
changes in folder order, from the change files, reading event streams through
the index, and store them nowhere. In each, `change` is the folder name and
`<id>` in an `id` is the folder's leading number, such as `007`.

- `validator_runs(change, run, outcome, harness, model, duration, exit_code, scenarios, findings, reason, output)`:
  one row per `validator_ran` event in the change's `.run/events/change.jsonl`,
  `run` its 1-based position among them, `findings` the length of its
  `findings`, and `reason` and `output` null when absent.
- `validator_findings(id, change, run, finding, capability, requirement, scenario, problem, detail, label)`:
  one row per entry of each run's `findings`, `finding` its 1-based position,
  and `id` `<id>.v<run>.<finding>`.
- `focused_runs(change, task, run, outcome, exit_code, duration, timed_out, scenarios, files)`:
  one row per `focused_ran` event in each task stream `.run/events/<n>.jsonl`,
  `run` its 1-based position in that stream, `timed_out` 1 or 0, and
  `scenarios` and `files` joined with a newline.
- `mutation_picks(change, task, pick, file, function, outcome, reason, killed, survived, invalid, duration, scenarios)`:
  one row per `mutation_ran` event in each task stream, `pick` its 1-based
  position in that stream, `reason` null when absent, and `scenarios` joined
  with a newline.
- `mutation_survivors(id, change, task, pick, file, function, line, column, mutator, replacement, label)`:
  one row per entry of each pick's `survivors`, `file` the survivor's own,
  `function` the pick's, and `id` `<id>.<task>.m<pick>.<n>` with `n` its
  1-based position.
- `link_findings(id, change, severity, file, message, label)`: one row per
  entry of the `traceability` list of the change's last `plan_ready` record,
  and `id` `<id>.l<n>` with `n` its 1-based position.

A task stream is a file whose name is digits and `.jsonl`, in numeric order.
An event without object `data` SHALL add no row, and a field of the wrong
type SHALL read as null. `label` SHALL be null unless "Trial labels" gives it
a value. `osq query` without a statement SHALL list these six tables after
`notices`, in this order, each with its columns.

#### Scenario: Trial rows of one archived change
- **WHEN** the archive holds `007-pricing`, whose `change.jsonl` holds a `validator_ran` event with outcome `failed` and output `boom` and then one with outcome `validated` and two findings; whose `2.jsonl` holds a `focused_ran` event with outcome `passed`, scenarios `widgets: Count` and files `tests/count.test.ts`, then a `mutation_ran` event with outcome `measured` on `src/count.ts` function `count` with one survivor at line 4 column 9, then a `mutation_ran` event with outcome `not_measured` and reason `budget`; and whose last `plan_ready` record's `traceability` holds one warning
- **THEN** the six tables hold exactly these rows:

| table | rows |
| --- | --- |
| `validator_runs` | (`007-pricing`, 1, `failed`, findings 0, output `boom`), (`007-pricing`, 2, `validated`, findings 2, output null) |
| `validator_findings` | ids `007.v2.1` and `007.v2.2`, run 2, findings 1 and 2, label null |
| `focused_runs` | (`007-pricing`, task `2`, run 1, `passed`, scenarios `widgets: Count`, files `tests/count.test.ts`) |
| `mutation_picks` | (task `2`, pick 1, `src/count.ts`, `count`, `measured`, reason null), (task `2`, pick 2, `not_measured`, reason `budget`) |
| `mutation_survivors` | (id `007.2.m1.1`, task `2`, pick 1, `src/count.ts`, `count`, line 4, column 9, label null) |
| `link_findings` | (id `007.l1`, `007-pricing`, `warning`, label null) |

#### Scenario: No trial data
- **WHEN** an archived change has no `validator_ran`, `focused_ran` or `mutation_ran` event and no `plan_ready` record with `traceability`
- **THEN** none of the six tables holds a row for it

#### Scenario: Trial tables listed
- **WHEN** `osq query` runs without a statement
- **THEN** it prints the six tables above after `notices`, in order, each with its columns, and exits zero

### Requirement: History query safety
`osq query` SHALL refuse, exit non-zero, and list the tables when the
statement would write, attach, run a pragma, read any table but those it
lists, or is followed by a second statement. A refused statement SHALL change
no file. Output SHALL never hold a verify log or a tool summary.

#### Scenario: A write
- **WHEN** `osq query "delete from changes"` runs
- **THEN** osq refuses it, lists the tables, exits non-zero, and changes no file

#### Scenario: A second statement
- **WHEN** `osq query "select 1; delete from changes"` runs
- **THEN** osq refuses it before running either statement
