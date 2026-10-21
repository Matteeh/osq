## ADDED Requirements

### Requirement: Report feature
`osq-feature-report` SHALL expose one public item, the unit struct
`ReportFeature`, which implements rust-core's `Feature` and holds no storage
connection, as ADR 028 says. Its `name` SHALL be `report`, and its
`commands` SHALL be exactly one `Command` named `query`, with the summary
`run one read-only SELECT over the osq history tables` and the usage
`[select]`.

#### Scenario: Report feature commands
- **WHEN** a test reads `ReportFeature`'s name and commands
- **THEN** the name is `report`, and the commands are one command with the name `query`, the summary `run one read-only SELECT over the osq history tables` and the usage `[select]`

### Requirement: Query arguments
`ReportFeature::run` SHALL return `FeatureError::unknown_command` with the
invocation's command for any command but `query`, and
`FeatureError::usage("query", "expected at most one select, got <n> arguments")`
for a `query` invocation with `n` arguments when `n` is more than one. Every
other failure of `query` SHALL be `FeatureError::failed` with the command
`query` and the message the other query requirements name.

#### Scenario: Query argument errors
- **WHEN** a test runs the invocation in the row with `tests/fixtures/history` as the root
- **THEN** it gives the row's error and writes no file:

| Invocation | Error |
|---|---|
| `query` with args `a`, `b` | `Usage` error displayed `usage of query: expected at most one select, got 2 arguments` |
| `report` with no args | `UnknownCommand` error displayed `unknown command: report` |

### Requirement: Query output parity
The text `query` returns SHALL be the text TypeScript's `runQuery` in
`src/core/report/query-run.ts` returns without `--json`, byte for byte, and
the message of a `query` failure SHALL be the message of the `QueryError`
`runQuery` throws for the same project and argument.

#### Scenario: Golden query output
- **WHEN** each case of `tests/fixtures/queries.json` whose `group` is `run` runs `query` on a fresh scratch copy of its `fixture` from `tests/fixtures/`, with the case's `select` as the one argument, or no argument when it is null
- **THEN** a case whose `result` is `output` gives an `Output` whose text equals the case's `text`, and a case whose `result` is `failed` gives a `Failed` error whose message equals the case's `text`, byte for byte, for these cases:

| Case | Select | Result |
|---|---|---|
| `table-list` | none | output |
| `blank-select` | `  \n` | output |
| `all-<table>`, one per table | `SELECT * FROM <table>` | output |
| `grouped-count` | `SELECT task, count(*) AS n FROM recertifications GROUP BY task ORDER BY task` | output |
| `join` | `SELECT c.title, t.task, t.title FROM changes c JOIN tasks t ON t.change = c.folder ORDER BY t.task` | output |
| `trailing-semicolon` | `SELECT id, title FROM changes ORDER BY id;  \n` | output |
| `recursive-cte` | `WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 3) SELECT x FROM n` | output |
| `literal-values` | `SELECT NULL AS empty, 'a' \|\| char(10) \|\| 'b' AS lines, 1.5 AS real, 7 AS whole, x'0102' AS bytes` | output: the header `empty`, `lines`, `real`, `whole` and `bytes`, then the row of an empty cell, `a\nb`, `1.5`, `7` and `1,2`, cells joined by tabs |
| `sqlite-error-no-statement` | `;` | failed |
| `sqlite-error-syntax` | `SELEC 1` | failed `osq query refused: near "SELEC": syntax error` and the table list |
| `sqlite-error-unknown-table` | `SELECT * FROM nope` | failed `osq query refused: no such table: nope` and the table list |
| `labels-error` | `SELECT 1` on `bad-labels` | failed `openspec/trials/validator.json must be a JSON object of true or false labels` |

### Requirement: Query table list
With no argument, or one that is empty after trimming whitespace, `query`
SHALL return the table list and create no file: one line
`<table>(<column>, <column>, ...)` per table, in the order of TypeScript's
`HISTORY_TABLES` in `src/core/report/query-tables.ts`, with the columns
rust-storage "Read model tables" creates, joined by newlines with no newline
at the end.

#### Scenario: Table list without a select
- **WHEN** the `table-list` and `blank-select` cases of `tests/fixtures/queries.json` run on fresh scratch copies of the `history` fixture
- **THEN** each gives the sixteen lines of the table list, the first `changes(id, folder, title, archived_on, goal, tasks, attempts, halts, elapsed_seconds, cost, planner)` and the last `manual_edits(kept_at, record, comment, paths, capabilities)`, and leaves the copy with no `.osq` folder

### Requirement: Query rows
With any other argument, `query` SHALL build the read model with
rust-storage `build_read_model(root, <root>/.osq/read-model.sqlite)`,
prepare only the first statement of the argument on that database, and
return a header line of the column names, then one line per row, each
line's cells joined by tabs and the lines joined by newlines with no newline
at the end.

#### Scenario: Paths in query values
- **WHEN** `query` runs `SELECT '<root>/a' AS p, '<home>/b' AS q` on a scratch copy of the `history` fixture, with `<root>` the copy's absolute path and `<home>` the `HOME` environment variable
- **THEN** the output is `p`, a tab, `q`, a newline, `./a`, a tab and `~/b`; when `HOME` is unset or empty, the second cell is `<home>/b` as written

### Requirement: Query cache
Before it builds the read model, `query` SHALL create `<root>/.osq/` and
write `<root>/.osq/.gitignore` holding `*` and a newline when that file is
missing, leaving it as it is when present, as TypeScript's stream index
does.

#### Scenario: Query cache files
- **WHEN** `query` runs on fresh scratch copies of the `history` fixture in the row
- **THEN** the copy holds the row's files afterwards:

| Run | Files afterwards |
|---|---|
| no argument | no `.osq` folder |
| `SELECT id FROM changes` | `.osq/read-model.sqlite`, and `.osq/.gitignore` holding `*` and a newline |
| `SELECT id FROM changes`, with `.osq/.gitignore` holding `keep` and a newline before the run | `.osq/read-model.sqlite`, and `.osq/.gitignore` still holding `keep` and a newline |

### Requirement: Query cells
A cell SHALL be empty for null, decimal digits for an integer, Rust's `f64`
`Display` text for a real, the bytes in decimal joined by `,` for a blob,
and for text the text with every occurrence of the root, made absolute with
`std::path::absolute`, replaced by `.`, then every occurrence of the `HOME`
environment variable, when it is set and not empty, replaced by `~`, then
every newline replaced by the two characters `\n`.

#### Scenario: Cells of each value kind
- **WHEN** the `literal-values` case of `tests/fixtures/queries.json` runs
- **THEN** its row holds an empty cell for `NULL`, `a\nb` for the text with a newline, `1.5` for the real, `7` for the integer and `1,2` for the blob

### Requirement: Query errors
A read model that cannot be built SHALL fail `query` with the
`ReadModelError`'s text. A statement SQLite cannot prepare SHALL fail it
with `osq query refused: <SQLite's message>`, a newline and the table list,
and an argument with no statement, such as `;`, with
`osq query refused: The SQL query contains no statements.`, a newline and
the table list. A row SQLite cannot step to SHALL fail it with SQLite's
message alone.

#### Scenario: Row that cannot be stepped
- **WHEN** `query` runs `SELECT abs(-9223372036854775808)` on a scratch copy of the `history` fixture
- **THEN** it gives a `Failed` error with the command `query` and the message `integer overflow`

### Requirement: Query refusals
Before it creates a file or builds the read model, `query` SHALL prepare
the first statement of its argument on an in-memory database holding only
the sixteen tables of the table list, under an authorizer that allows a
select, a function, a recursive common table expression and a read of one
of those tables, and denies every other action, remembering the first one
it denies. The read model's connection SHALL prepare under the same
authorizer.

#### Scenario: Golden query refusals
- **WHEN** each case of `tests/fixtures/queries.json` whose `group` is `authorize` runs `query` on a fresh scratch copy of its `fixture`, with the case's `select` as the one argument
- **THEN** each gives a `Failed` error whose message equals the case's `text` byte for byte: the row's first line, a newline and the table list:

| Case | Select | First line |
|---|---|---|
| `refused-insert` | `INSERT INTO changes (id) VALUES ('9')` | `osq query refused: the statement would write to the database` |
| `refused-update` | `UPDATE tasks SET done = 1` | `osq query refused: the statement would write to the database` |
| `refused-delete` | `DELETE FROM changes` | `osq query refused: the statement would write to the database` |
| `refused-drop` | `DROP TABLE changes` | `osq query refused: the statement would write to the database` |
| `refused-create` | `CREATE TABLE t (a)` | `osq query refused: the statement would write to the database` |
| `refused-pragma` | `PRAGMA table_info(changes)` | `osq query refused: the statement would run a pragma` |
| `refused-attach` | `ATTACH DATABASE 'other.db' AS other` | `osq query refused: the statement would attach a database` |
| `refused-detach` | `DETACH DATABASE other` | `osq query refused: the statement would attach a database` |
| `refused-hidden-table` | `SELECT name FROM sqlite_master` | `osq query refused: the statement would read a table osq does not expose (sqlite_master)` |
| `refused-transaction` | `BEGIN` | `osq query refused: the statement is not a read-only SELECT over the history tables` |
| `refused-second-select` | `SELECT 1; SELECT 2` | `osq query refused: the input holds a second statement after the first` |
| `refused-double-semicolon` | `SELECT 1;;` | `osq query refused: the input holds a second statement after the first` |
| `refused-second-write` | `SELECT 1; DELETE FROM changes` | `osq query refused: the input holds a second statement after the first` |
| `labels-refused-first`, on `bad-labels` | `DELETE FROM changes` | `osq query refused: the statement would write to the database` |

### Requirement: Query denial causes
When the authorizer's prepare fails after a denial, `query` SHALL fail with
the first denial's cause, a newline and the table list, writing no file. An
insert, update or delete SHALL give
`osq query refused: the statement would write to the database`; a pragma
`osq query refused: the statement would run a pragma`; and an attach or
detach `osq query refused: the statement would attach a database`.

#### Scenario: Refusal writes nothing
- **WHEN** `query` runs `DELETE FROM changes`, and then `SELECT 1; SELECT 2`, each on a fresh scratch copy of the `history` fixture
- **THEN** each gives a `Failed` error and leaves the copy with no `.osq` folder

### Requirement: Query other denials
A denied read of a table outside the sixteen SHALL give
`osq query refused: the statement would read a table osq does not expose (<table>)`,
and any other denied action
`osq query refused: the statement is not a read-only SELECT over the history tables`,
each followed by a newline and the table list.

#### Scenario: Hidden table and transaction
- **WHEN** the `refused-hidden-table` and `refused-transaction` cases of `tests/fixtures/queries.json` run
- **THEN** the first fails with `osq query refused: the statement would read a table osq does not expose (sqlite_master)` and the second with `osq query refused: the statement is not a read-only SELECT over the history tables`, each followed by a newline and the table list

### Requirement: Query second statement
When the prepare succeeds but the argument, after trimming trailing
whitespace and then at most one trailing `;`, is longer than the prepared
statement's SQL text trimmed the same way, `query` SHALL fail with
`osq query refused: the input holds a second statement after the first`, a
newline and the table list, writing no file.

#### Scenario: Trailing semicolon is one statement
- **WHEN** the `trailing-semicolon` case and the `refused-double-semicolon` case of `tests/fixtures/queries.json` run
- **THEN** `SELECT id, title FROM changes ORDER BY id;  \n` gives its rows, and `SELECT 1;;` gives the second-statement refusal
