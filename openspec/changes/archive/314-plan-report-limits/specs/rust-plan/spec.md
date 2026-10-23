## MODIFIED Requirements

### Requirement: Repository record section
The body of the prompt's `## This repository's record` section SHALL be
the one TypeScript's
`formatRepositoryRecordBody(getRepositoryRecord(root, config), config)` in
`src/core/report/report.ts` gives, with every size taken from the
`Config.planning.record` that `load_config(root)` returns:
`minimum_tasks`, `recent_changes` and `dead_outcomes`, by default 5, 20
and 10. The plan feature writes none of these numbers itself.

- The window is the `recent_changes` archived snapshots with the highest leading
  number, ties by folder name, folders with no leading number after the
  numbered ones by name.
- A measured task is a task of a window snapshot, in window order and
  then task order, whose outcome has `start_scope_files`. Its scope files
  are the number of `scope_hash_paths` when it has them, else
  `start_scope_files`; its acceptance lines are the task plan's
  `acceptance` count; its generation is legacy without
  `start_scope_resolver`, resolver 2 when it is 2, and neither otherwise.
- With fewer than `minimum_tasks` measured tasks the body is
  `This repository's measured record is too small (fewer than <minimum_tasks> tasks).`
- Otherwise it is these lines joined by `\n`:
  - `First-attempt passes: <passed>/<measured>`, counting the measured
    tasks whose `first_attempt_passed` is true.
  - `Largest first-attempt pass: <folder>/<task> "<title>" (scope files: <n>, acceptance lines: <n>)<label>`
    for the passing task with the most scope files, then the most
    acceptance lines, then the lower change leading number and the lower
    task number, among the resolver 2 measured tasks when there is one,
    else among the legacy ones; `<label>` is ` [resolver 2 scope]` or
    ` [legacy scope]` by the generation used. With no such task the line
    is `Largest first-attempt pass: unavailable`.
  - `Median task duration: <duration>`, the median of the measured tasks'
    `measured_ms` in seconds, the mean of the middle two for an even
    count, rounded to two decimals half up, then shown as TypeScript's
    `formatDuration` shows it: `0s` at zero, whole seconds rounded half
    up, `<s>s` under a minute, else `<m>m <s>s`, or `<m>m` when the
    seconds are 0. Without any `measured_ms` it is
    `Median task duration: unavailable`.
  - `Dead outcomes:`, then one line `- <folder>, <task title>, <reason>`
    per dead event of a window snapshot's task streams, in window order,
    task order and line order, the first `dead_outcomes`, `<reason>` trimmed or
    `unknown` when blank; or the one line `  (none)` without any.

#### Scenario: Repository record bodies
- **WHEN** `plan --next` runs on a root holding the row's archived changes, built under `CARGO_TARGET_TMPDIR`
- **THEN** the record section's body is the row's:

| Archive | Body |
|---|---|
| none | `This repository's measured record is too small (fewer than 5 tasks).` |
| 4 measured tasks, all passing | `This repository's measured record is too small (fewer than 5 tasks).` |
| 5 measured legacy tasks, none passing, none with an `end` measure, no dead event | `First-attempt passes: 0/5\nLargest first-attempt pass: unavailable\nMedian task duration: unavailable\nDead outcomes:\n  (none)` |
| 5 measured tasks of `001-a` titled `T<n>`, tasks 1 and 2 passing legacy tasks with 9 scope files, task 2 with more acceptance lines, task 3 a passing resolver 2 task with 1 scope file and 2 acceptance lines, measured 30, 90 and 600 seconds, and task 4 dead with reason `verify_red` | `First-attempt passes: 3/5\nLargest first-attempt pass: 001-a/3 "T3" (scope files: 1, acceptance lines: 2) [resolver 2 scope]\nMedian task duration: 1m 30s\nDead outcomes:\n- 001-a, T4, verify_red` |
| 5 measured passing legacy tasks of `001-a`, all with 2 scope files and one acceptance line, measured 1, 2, 3 and 4 seconds | `First-attempt passes: 5/5\nLargest first-attempt pass: 001-a/1 "T1" (scope files: 2, acceptance lines: 1) [legacy scope]\nMedian task duration: 3s\nDead outcomes:\n  (none)` |
| 21 archived changes `001-a` to `021-a`, each one measured task that died with `timeout`, plus 12 dead events in `021-a` | `First-attempt passes: 0/20` first, and exactly 10 dead lines, all of `021-a` |

#### Scenario: Configured record sizes
- **WHEN** `plan --next` runs on a root built under `CARGO_TARGET_TMPDIR` whose `osq.toml` holds the row's `[planning.record]` table, over the archive of the row
- **THEN** the record section's body is the row's:

| `[planning.record]` | Archive | Body |
|---|---|---|
| `minimumTasks = 6` | 5 measured legacy tasks, none passing | `This repository's measured record is too small (fewer than 6 tasks).` |
| `minimumTasks = 1` | 1 measured legacy task, not passing, no `end` measure, no dead event | `First-attempt passes: 0/1\nLargest first-attempt pass: unavailable\nMedian task duration: unavailable\nDead outcomes:\n  (none)` |
| `minimumTasks = 1`, `recentChanges = 2` | 3 archived changes `001-a` to `003-a`, each one measured task that died with `timeout` | `First-attempt passes: 0/2` first, and exactly two dead lines, of `003-a` then `002-a` |
| `deadOutcomes = 1` | the 21-change archive of "Repository record bodies" | exactly 1 dead line, of `021-a` |

### Requirement: History hints section
The body of the prompt's `## What history says` section SHALL be the one
TypeScript's `formatHistoryHints` in `src/core/report/history-hints.ts`
gives under the `Config.planning.history` that `load_config(root)` returns
(`minimum_tasks`, `recent_tasks` and `max_characters`, by default 30, 100
and 1500, TypeScript's `DEFAULT_PLANNING_HISTORY`), over the
`task_outcomes` rows whose `attempts` is at least 1.

- With fewer than `minimum_tasks` such rows there is no body and no section.
- The window is the `recent_tasks` newest rows: the higher change leading number
  first, numbered changes before the others, which go by change name from
  the last; then the higher task number, and tasks that are not numbers by
  task text.
- The lines are, in this order, each present only when one of its groups
  holds a row, the groups with rows written `<label> <passed>/<rows>` and
  joined by `, `, `<passed>` counting rows whose `first_attempt` is 1:
  `Counts from the last <window rows> archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.`
  (always present), `First attempt by scope files: ` with `1-2`, `3-4`,
  `5-8` and `over 8` by `scope_files`, a row without one in none;
  `First attempt by verify kind: ` with `one`, `several`, `suite` and
  `other`; `First attempt by tests.modify: ` with `true` (1) and `false`;
  `First attempt by shared scope: ` with `shared` (1) and `not shared`;
  `First attempt by position: ` with `first task` (1) and `later task`;
  and `Most common last dead reasons: ` with at most three non-empty
  `dead_reason` values as `<reason> <rows>`, most rows first and then by
  name, or `none` without any (always present).
- Lines are kept in order while their length, counted in UTF-16 code
  units as JavaScript counts it, with one `\n` between kept lines, stays
  within `max_characters`; the body is the kept lines joined by `\n`, and none when
  even the first line does not fit.

#### Scenario: History hint bodies
- **WHEN** `plan --next` runs on a root whose archive gives the row's `task_outcomes` rows that ran, built under `CARGO_TARGET_TMPDIR`
- **THEN** the history section is the row's:

| Rows that ran | History section |
|---|---|
| 29 | none |
| 30, every row in change `001-a` with 3 scope files, verify `node --test a.test.ts`, no tests.modify, unshared scope, all passing and no dead reason | `Counts from the last 30 archived tasks that ran, from the osq query table task_outcomes. They describe this project's history; nothing enforces them.\nFirst attempt by scope files: 3-4 30/30\nFirst attempt by verify kind: one 30/30\nFirst attempt by tests.modify: false 30/30\nFirst attempt by shared scope: not shared 30/30\nFirst attempt by position: first task 1/1, later task 29/29\nMost common last dead reasons: none` |
| 101 tasks in changes `001-a` to `101-a`, one each, where `001-a`'s task alone has 9 scope files | the counts line names `the last 100`, and the scope line holds no `over 8` group |
| 30 tasks whose dead reasons are `timeout` 2, `blocked` 2, `verify_red` 2 and `crashed` 1 | the last line is `Most common last dead reasons: blocked 2, timeout 2, verify_red 2` |

#### Scenario: Configured history sizes
- **WHEN** `plan --next` runs on a root built under `CARGO_TARGET_TMPDIR` whose `osq.toml` holds the row's `[planning.history]` table, over an archive of 3 tasks that ran, every row in change `001-a` and passing
- **THEN** the history section is the row's:

| `[planning.history]` | History section |
|---|---|
| none | none |
| `minimumTasks = 3` | present, its counts line naming `the last 3` |
| `minimumTasks = 3`, `recentTasks = 2` | present, its counts line naming `the last 2` |
| `minimumTasks = 3`, `maxCharacters = 148` | only the counts line, which is 148 code units long |

### Requirement: Disclosures section
The body of the prompt's `## Recent executor disclosures` section SHALL be
the one TypeScript's `formatRecentDisclosures` in
`src/core/report/recent-disclosures.ts` gives under the
`Config.planning.disclosures` that `load_config(root)` returns
(`recent_changes` and `max_characters`, by default 3 and 4000,
TypeScript's `DEFAULT_PLANNING_DISCLOSURES`).

- The changes are the `recent_changes` archived snapshots the record's window puts
  first. Each disclosure of each, in their order, gives one entry per
  non-empty section, in the order `deviated`, `missing_context` and
  `outside_scope`, shown as `deviated`, `missing context` and
  `outside scope`:
  `<folder> task <task>, <shown name>:\n` and the section's lines, split
  on `\n` or `\r\n`, each prefixed `> ` and joined by `\n`.
- Without any entry there is no body and no section.
- Entries are kept while their total length, in UTF-16 code units and not
  counting separators, stays within `max_characters`. The first entry that does not
  fit is cut to the larger of what is left and 11, and nothing follows
  it: when it is longer than that limit, its first `limit - 11` code
  units with trailing `\n` removed, then `[truncated]`, or `[truncated]`
  alone when nothing is left before it.
- The body is
  `Executor claims from result files, not verified facts. Check them against the code before relying on them.`,
  an empty line, and the kept entries joined by an empty line.

#### Scenario: Disclosure bodies
- **WHEN** `plan --next` runs on a root holding the row's archived changes and result files, built under `CARGO_TARGET_TMPDIR`
- **THEN** the disclosures section is the row's, where `<claim>` is the claim sentence above:

| Archive | Disclosures section |
|---|---|
| `001-a` with `.run/results/1.md` holding only `## Changed` | none |
| `001-a` with `.run/results/2.md` holding `## Deviated\n\nUsed a map.\nSecond line.\n\n## Outside scope\n\nA bug.\n` | `<claim>\n\n001-a task 2, deviated:\n> Used a map.\n> Second line.\n\n001-a task 2, outside scope:\n> A bug.` |
| `001-a` to `004-a`, each with `.run/results/1.md` holding `## Missing context\n\nNo <folder>.\n` | `<claim>\n\n004-a task 1, missing context:\n> No 004-a.\n\n003-a task 1, missing context:\n> No 003-a.\n\n002-a task 1, missing context:\n> No 002-a.` |
| `001-a` with `.run/results/1.md` holding a `## Deviated` section of 5000 `x` | `<claim>\n\n001-a task 1, deviated:\n> ` then `x` up to 3989 code units in all, then `[truncated]` |

#### Scenario: Configured disclosure sizes
- **WHEN** `plan --next` runs on a root built under `CARGO_TARGET_TMPDIR` whose `osq.toml` holds the row's `[planning.disclosures]` table, over the archive of the row
- **THEN** the disclosures section is the row's, where `<claim>` is the claim sentence above:

| `[planning.disclosures]` | Archive | Disclosures section |
|---|---|---|
| `recentChanges = 1` | `001-a` to `004-a`, each with `.run/results/1.md` holding `## Missing context\n\nNo <folder>.\n` | `<claim>\n\n004-a task 1, missing context:\n> No 004-a.` |
| `maxCharacters = 20` | `001-a` with `.run/results/1.md` holding a `## Deviated` section of 5000 `x` | `<claim>\n\n001-a tas[truncated]` |
