# rust-report Specification

## Purpose
The report feature displays the read model through `osq report`, `osq query` and the dashboard. It does not own the read model's queries. It holds the feature's logic, its command, its route and its loop hooks, as ADR 022 says.

## Requirements

### Requirement: Code ownership
<!-- source: crates/features/report/** -->
The rust-report capability SHALL own the `osq-feature-report` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Report crate ownership
- **WHEN** file ownership is resolved for the report feature
- **THEN** system maps `crates/features/report/**` to rust-report

### Requirement: Report feature
`osq-feature-report` SHALL expose one public item, the unit struct
`ReportFeature`, which implements rust-core's `Feature` and holds no storage
connection, as ADR 028 says. Its `name` SHALL be `report`, and its
`commands` SHALL be exactly one `Command` named `query`, with the summary
`run one read-only SELECT over the osq history tables` and the usage
`[--json] [select]`.

#### Scenario: Report feature commands
- **WHEN** a test reads `ReportFeature`'s name and commands
- **THEN** the name is `report`, and the commands are one command with the name `query`, the summary `run one read-only SELECT over the osq history tables` and the usage `[--json] [select]`

### Requirement: Query arguments
`ReportFeature::run` SHALL return `FeatureError::unknown_command` for any
command but `query`. An argument that is exactly `--json` SHALL ask for
JSON output, in any position and any number of times; every other argument
is a select. More than one select SHALL give
`FeatureError::usage("query", "expected at most one select, got <n> arguments")`.
Every other failure of `query` SHALL be `FeatureError::failed` with the
command `query` and the message the other query requirements name.

#### Scenario: Query argument errors
- **WHEN** a test runs the invocation in the row with `tests/fixtures/history` as the root
- **THEN** it gives the row's error and writes no file:

| Invocation | Error |
|---|---|
| `query` with args `a`, `b` | `Usage` error displayed `usage of query: expected at most one select, got 2 arguments` |
| `query` with args `--json`, `a`, `b` | `Usage` error displayed `usage of query: expected at most one select, got 2 arguments` |
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

### Requirement: Query JSON output
With `--json`, `query` SHALL return the text TypeScript's `runQuery` in
`src/core/report/query-run.ts` returns with `{ json: true }`, byte for
byte: the table list for no select or a blank one, the message it gives
without `--json` for every failure, and otherwise a JSON array of one
object per row, in row order, with no whitespace between tokens and no
newline at the end. The read model, cache files and refusals SHALL be those
of `query` without `--json`.

#### Scenario: Golden JSON query output
- **WHEN** each case of `tests/fixtures/queries-json.json` runs `query` on a fresh scratch copy of its `fixture` from `tests/fixtures/`, with the arguments `--json` and the case's `select`, or `--json` alone when it is null
- **THEN** a case whose `result` is `output` gives an `Output` whose text equals the case's `text`, and a case whose `result` is `failed` gives a `Failed` error whose message equals the case's `text`, byte for byte, for these cases:

| Case | Select | Result |
|---|---|---|
| `table-list` | none | output: the table list |
| `blank-select` | `  \n` | output: the table list |
| `all-<table>`, one per table, `_` written `-` | `SELECT * FROM <table>` | output |
| `empty-result` | `SELECT id, title FROM changes WHERE 0` | output `[]` |
| `grouped-count` | `SELECT task, count(*) AS n FROM recertifications GROUP BY task ORDER BY task` | output `[{"task":"1","n":3},{"task":"2","n":1}]` |
| `join` | `SELECT c.title, t.task, t.title FROM changes c JOIN tasks t ON t.change = c.folder ORDER BY t.task` | output `[{"title":"When one, run","task":"1"},{"title":"When two, run","task":"2"}]` |
| `trailing-semicolon` | `SELECT id, title FROM changes ORDER BY id;  \n` | output |
| `literal-values` | `SELECT NULL AS empty, 'a' \|\| char(10) \|\| 'b' AS lines, 1.5 AS real, 7 AS whole, x'0102' AS bytes` | output `[{"empty":null,"lines":"a\nb","real":1.5,"whole":7,"bytes":{"0":1,"1":2}}]` |
| `empty-blob` | `SELECT x'' AS empty_bytes, zeroblob(3) AS zeros` | output `[{"empty_bytes":{},"zeros":{"0":0,"1":0,"2":0}}]` |
| `integers` | zero, `-7` and both safe-integer bounds | output `[{"zero":0,"negative":-7,"largest":9007199254740991,"smallest":-9007199254740991}]` |
| `reals` | fourteen reals, two of them infinite | output |
| `string-escapes` | quotes, a backslash, a slash, each named escape, control characters, U+2028 and U+2029 | output |
| `non-ascii` | `é ü`, an emoji and `char(55296)` | output |
| `key-escapes` | `SELECT 1 AS "a""b", 2 AS "c\d"` | output `[{"a\"b":1,"c\\d":2}]` |
| `integer-keys` | columns named `b`, `2`, `a`, `1`, `10`, `4294967295`, `4294967294`, `01`, `-1` and `1.5` | output |
| `duplicate-keys` | `SELECT 1 AS a, 2 AS b, 3 AS a, 4 AS "2", 5 AS "2"` | output |
| `refused-delete` | `DELETE FROM changes` | failed |
| `refused-second-select` | `SELECT 1; SELECT 2` | failed |
| `sqlite-error-no-statement` | `;` | failed |
| `sqlite-error-syntax` | `SELEC 1` | failed |
| `labels-error` | `SELECT 1` on `bad-labels` | failed `openspec/trials/validator.json must be a JSON object of true or false labels` |

#### Scenario: JSON flag in any position
- **WHEN** `query` runs `SELECT id, title FROM changes ORDER BY id` on a scratch copy of the `history` fixture with the arguments in the row
- **THEN** the output is `[{"id":"001","title":"Run"},{"id":"002","title":"Quiet"}]` for each row:

| Arguments |
|---|
| `--json`, the select |
| the select, `--json` |
| `--json`, the select, `--json` |

### Requirement: Query JSON keys
Each row's object SHALL hold its column names in JavaScript's own-property
order: first every name that is an array index, the canonical decimal text
of an integer from 0 to 4294967294, in ascending numeric order, then every
other name in column order. A name that appears more than once SHALL keep
the place of its first column and the value of its last.

#### Scenario: Keys in JavaScript order
- **WHEN** the golden case in the row runs as "Golden JSON query output" runs it
- **THEN** its output is the row's:

| Case | Output |
|---|---|
| `join` | `[{"title":"When one, run","task":"1"},{"title":"When two, run","task":"2"}]` |
| `integer-keys` | `[{"1":1,"2":2,"10":10,"4294967294":4294967294,"b":"x","a":"y","4294967295":4294967295,"01":3,"-1":4,"1.5":5}]` |
| `duplicate-keys` | `[{"2":5,"a":3,"b":2}]` |

### Requirement: Query JSON values
Each JSON value SHALL be `null` for null; for an integer, its decimal
digits with a leading `-` when it is negative; for a blob, an object whose
keys are the byte positions from `0` and whose values are the bytes in
decimal, `{}` when it is empty; and for text, a JSON string of the text
with every occurrence of the root, made absolute with
`std::path::absolute`, replaced by `.`, then every occurrence of the `HOME`
environment variable, when it is set and not empty, replaced by `~`.

#### Scenario: Paths in JSON values
- **WHEN** `query` runs with the arguments `--json` and `SELECT '<root>/a' AS p, '<home>/b' AS q, 3 AS n` on a scratch copy of the `history` fixture, with `<root>` the copy's absolute path and `<home>` the `HOME` environment variable
- **THEN** the output is `[{"p":"./a","q":"~/b","n":3}]`; when `HOME` is unset or empty, the value of `q` is `<home>/b` as written

#### Scenario: Integers beyond JavaScript's safe range
- **WHEN** `query` runs with the arguments `--json` and `SELECT 9007199254740993 AS big, -9223372036854775808 AS least` on a scratch copy of the `history` fixture
- **THEN** the output is `[{"big":9007199254740993,"least":-9223372036854775808}]`, where TypeScript fails because a JavaScript number cannot hold them

### Requirement: Query JSON reals
A real SHALL be written as ECMAScript's `Number::toString` writes it:
`null` when not finite, `0` for either zero, and otherwise a `-` when
negative, then, with `d` the shortest digits that read back as the real and
its magnitude `0.d` times ten to the `n`, the digits in plain notation
padded with zeros when `n` is from -5 to 21, else the first digit, a `.`
and the rest when there is a rest, `e`, and `n - 1` signed `+` or `-`.

#### Scenario: Reals as JavaScript writes them
- **WHEN** the `reals` golden case runs as "Golden JSON query output" runs it
- **THEN** each column's value is the row's:

| Column | Real | Value |
|---|---|---|
| `a` | `1e21` | `1e+21` |
| `b` | `1e20` | `100000000000000000000` |
| `c` | `1e-7` | `1e-7` |
| `d` | `0.000001` | `0.000001` |
| `e` | `2.0` | `2` |
| `f` | `-0.0` | `0` |
| `g` | `0.1 + 0.2` | `0.30000000000000004` |
| `h` | `1.0 / 3` | `0.3333333333333333` |
| `i` | `5e-324` | `5e-324` |
| `j` | `1.7976931348623157e308` | `1.7976931348623157e+308` |
| `k` | `-1.5e-10` | `-1.5e-10` |
| `l` | `123456.789` | `123456.789` |
| `m` | `1e300 * 1e300` | `null` |
| `n` | `-1e300 * 1e300` | `null` |

### Requirement: Query JSON strings
A JSON string, a key's or a value's, SHALL be written as `JSON.stringify`
writes it: `"` and `\` after a backslash; backspace, tab, newline, form
feed and carriage return as `\b`, `\t`, `\n`, `\f` and `\r`; every other
character below U+0020 as `\u` and four lowercase hex digits; and every
other character as itself, DEL, U+2028 and U+2029 included. Text that is
not valid UTF-8 SHALL be read as `String::from_utf8_lossy` reads it.

#### Scenario: Characters JSON leaves as they are
- **WHEN** `query` runs with the arguments `--json` and `SELECT 'a' || char(127) || char(8232) || '/é' AS d` on a scratch copy of the `history` fixture
- **THEN** the output is `[{"d":"a`, the characters U+007F and U+2028, then `/é"}]`
