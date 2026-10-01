## ADDED Requirements

### Requirement: History query tables
`osq query` SHALL build these tables of archived changes on every call, from
the change files, reading event streams through the index:
`changes(id, folder, title, archived_on, goal, tasks, attempts, halts,
elapsed_seconds, cost, planner)`, `requirements(change, capability, kind,
requirement, renamed_from)`, `tasks(change, task, title, attempts, done)`,
`dead_attempts(change, task, reason)`, and `disclosures(change, task, section,
text)`. It SHALL store them nowhere.

#### Scenario: One archived change
- **WHEN** the archive holds one change with two tasks, one dead attempt, an added requirement, and a `## Deviated` section
- **THEN** each table holds that change's rows, with `kind` `added`, `section` `deviated`, and the dead attempt's reason

### Requirement: History query command
`osq query "<select>"` SHALL run one SQL statement and print a header row and
one row per result, tab-separated, writing a newline inside a value as `\n`.
With `--json` it SHALL print the rows as a JSON array of objects. `osq query`
without a statement SHALL print each table with its columns. Every string
value SHALL have the project root replaced by `.` and the home directory by
`~`.

#### Scenario: Listing the tables
- **WHEN** `osq query` runs without a statement
- **THEN** it prints the five tables, each with its columns, and exits zero

### Requirement: History query safety
`osq query` SHALL refuse, exit non-zero, and list the tables when the
statement would write, attach, run a pragma, read any table but the five,
or is followed by a second statement. A refused statement SHALL change no
file. Output SHALL never hold a verify log or a tool summary.

#### Scenario: A write
- **WHEN** `osq query "delete from changes"` runs
- **THEN** osq refuses it, lists the tables, exits non-zero, and changes no file

#### Scenario: A second statement
- **WHEN** `osq query "select 1; delete from changes"` runs
- **THEN** osq refuses it before running either statement

## MODIFIED Requirements

### Requirement: Report index location
`osq report` SHALL keep its index in `.osq/index.sqlite` at the project root,
and SHALL write `.osq/.gitignore` holding `*` when it creates the folder, so
git ignores the folder without a change to the project's `.gitignore`. Only
`osq report` and `osq query` SHALL use the index.

#### Scenario: First report in a project
- **WHEN** `osq report` runs in a project without a `.osq/` folder
- **THEN** afterwards `.osq/index.sqlite` exists, `.osq/.gitignore` holds `*`, and `git status` lists neither

### Requirement: Code ownership
<!-- source: src/core/report/**, src/cli/report.ts, src/cli/digest.ts, src/cli/query.ts, tests/report*.test.ts, tests/change-digest*.test.ts, tests/query*.test.ts, fixture/report/** -->
The Metrics and Reporting capability SHALL own planning logs, the report, the
archived change record, the digest, the history query, their CLI commands and
tests, and the report fixture.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for planning records, delivery reporting, the change digest, or the history query
- **THEN** system maps `src/core/report/**`, `src/cli/report.ts`, `src/cli/digest.ts`, `src/cli/query.ts`, `tests/report*.test.ts`, `tests/change-digest*.test.ts`, `tests/query*.test.ts`, and `fixture/report/**` to `metrics-and-reporting`
