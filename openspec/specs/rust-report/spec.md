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
`commands` SHALL be exactly two `Command`s, in this order: `report`, with
the summary `display delivery metrics and task completion report` and the
usage `[--json]`; then `query`, with the summary
`run one read-only SELECT over the osq history tables` and the usage
`[--json] [select]`.

#### Scenario: Report feature commands
- **WHEN** a test reads `ReportFeature`'s name and commands
- **THEN** the name is `report`, and the commands are, in order, one command with the name `report`, the summary `display delivery metrics and task completion report` and the usage `[--json]`, then one command with the name `query`, the summary `run one read-only SELECT over the osq history tables` and the usage `[--json] [select]`

### Requirement: Query arguments
`ReportFeature::run` SHALL return `FeatureError::unknown_command` for any
command but `report` and `query`. For `query`, an argument that is exactly
`--json` SHALL ask for JSON output, in any position and any number of
times; every other argument is a select. More than one select SHALL give
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
| `summary` with no args | `UnknownCommand` error displayed `unknown command: summary` |

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

### Requirement: Report arguments
For `report`, an argument that is exactly `--json` SHALL ask for JSON
output, in any position and any number of times. Any other argument SHALL
give `FeatureError::usage("report", "expected [--json], got <argument>")`
for the first such argument, before `report` reads any file.

#### Scenario: Report argument errors
- **WHEN** a test runs `report` with the row's args on a scratch root holding an `osq.toml` whose `[vcs]` has `enabled = "yes"`
- **THEN** it gives the row's `Usage` error, not the config error, and writes no file:

| Args | Error |
|---|---|
| `--since`, `2026-10-01` | `usage of report: expected [--json], got --since` |
| `--json`, `x`, `y` | `usage of report: expected [--json], got x` |
| `--until=2026-10-01` | `usage of report: expected [--json], got --until=2026-10-01` |

### Requirement: Report changes
`report` SHALL read the root's `osq.toml` with the config kernel's
`load_config`, and fail with `FeatureError::failed("report", ..)` and the
config error's display when it refuses the file. When the config's
`vcs.enabled` is true and git is on, as rust-show "Show git state" decides
it with a `GitVcs` bounded by the config's `timeouts`, `report` SHALL count
the active and archived entries `list_tree_changes` gives for
`change_trees` over the root, its git worktrees and the folders directly
under the vcs kernel's `stacked_root` for the `HOME` folder, none when
`HOME` is unset or that folder cannot be read. A failing worktree listing
SHALL fail `report` with `FeatureError::failed("report", ..)` and the
`VcsError`'s display. Otherwise `report` SHALL count the active and
archived entries of `list_changes` for the root. Rejected changes never
count.

#### Scenario: Report refuses a bad config
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/thirds` holding an `osq.toml` whose `[vcs]` has `enabled = "yes"`
- **THEN** it gives the `Failed` error for `report` whose message equals the display of the error `load_config` gives for that root

#### Scenario: Report across worktrees
- **WHEN** a test runs `report` on a scratch git repository root whose `osq.toml` holds `[vcs]` with `enabled = true`, holding an active `001-a` with `proposal.md` and `tasks/1.md`, and an active `002-b` with no `.run/approved`, with `proposal.md` and `tasks/1.md` to `tasks/3.md`; and a git worktree outside the root on the branch `osq/002-b` holding `openspec/changes/002-b/` with `proposal.md`, `tasks/1.md`, `tasks/2.md`, `.run/approved` and `.run/done/1` holding `---\nscope_hash: sha256:1\n---\n`
- **THEN** the text's lines are `  Total specs: 2 (2 active, 0 archived)`, `  Total tasks: 3`, `  Done: 1`, `  Verified done: 1`, `  Pending: 2` and `  Completion rate: 33.33%`, every other count is 0, and the same root with `enabled = false` gives `  Total tasks: 4`, `  Done: 0` and `  Completion rate: 0%`

### Requirement: Report counts
`report` SHALL count as TypeScript's `buildMetricsReport` counts. The
`active` and `archived` spec counts are the number of active and archived
changes `report` counts, and `total` is their sum. Each task of each
counted change, as `read_now_facts` gives them, SHALL have one status, the
first that holds of: `regressed`; `done`; `dead`; `running`; `pending`.
Every task of a change whose `has_proposal` is false SHALL be `pending`.
`total` is the number of tasks. `done`, `dead`, `regressed` and `running`
count the tasks with that status. A done task is `manual` when its
`manual` is true and `verified` otherwise. A pending task is `unmarked` in
an archived change and `pending` in an active one. The completion rate
SHALL be JavaScript's `Math.round(done / total * 10000) / 100`, and 0
with no tasks.

#### Scenario: Status order
- **WHEN** a test runs `report` on a scratch root holding one active change `001-a` with the row's proposal, `tasks/1.md` to `tasks/5.md`, `.run/regressed/1.md`, `.run/done/1`, `.run/done/2`, `.run/dead/1.md`, `.run/dead/2.md`, `.run/dead/3.md`, and `.run/running/1.pid` to `.run/running/4.pid`, each marker holding `x\n`
- **THEN** the text's `Now:` lines give the row's counts, every other count 0:

| Proposal | Counts |
|---|---|
| `proposal.md` | total 5, done 1, verified 1, dead 1, regressed 1, running 1, pending 1, completion rate `20` |
| `spec.md` | total 5, done 1, verified 1, dead 1, regressed 1, running 1, pending 1, completion rate `20` |
| none | total 5, pending 5, completion rate `0` |

### Requirement: Report summary
`report` SHALL return the text TypeScript's `reportCommand` returns without
`--json`, byte for byte, from its first line through the last line of its
`Coverage:` section, the line before the first blank line after `Coverage:`,
with no newline at the end. The text is:
`osq Delivery Metrics Report`, a blank line, `Specs Summary:`, then
`  Total specs: <total> (<active> active, <archived> archived)`, a blank
line, `Now:`, then `  Total tasks:`, `  Done:`, `  Verified done:`,
`  Manual done:`, `  Dead:`, `  Regressed:`, `  Running:`, `  Pending:`
and `  Unmarked:`, each followed by a space and its count, then
`  Completion rate: <rate>%`, then the `History:` lines that rust-report
"Report history" gives, then the lines that rust-report "Report history
blocks" and "Report sizes" give, then, when rust-report "Report validation"
gives a section, a blank line and its lines, then a blank line and the lines
rust-report "Report coverage" gives. With `--json`, `report` SHALL return
the `completionRate`, `coverage`, `now`, `specs` and `validation` members of
TypeScript's `report --json` object, `validation` left out when "Report
validation" gives none, and its `history` member with only the
`attempts`, `cost`, `deadByReason`, `dependencies`, `disclosures`,
`preSpawnVerify`, `rejections`, `retries`, `rework`, `scopeRegressions`,
`sizes`, `unexplainedReruns` and `verifyRuns` members, of which
`dependencies`, `disclosures` and `rework` are left out when they would be
empty. They are written as `serializeSortedJson` writes them: keys in
sorted order, two-space indents, `{}` and `[]` for an empty object and an
empty array, and no newline at the end. Every number SHALL be written as
JavaScript writes a number: a whole number with no fraction, such as `0`
and `100`, and any other as its shortest decimal, such as `31.25` and
`0.7000000000000001`.

Rust reads no traceability setting, so no capability opts in, and `report`
SHALL print no `Traceability:` section and write no `traceability` member,
as TypeScript leaves them out for a project with
`traceability.capabilities` empty, its default.

#### Scenario: Report summary equals TypeScript's
- **WHEN** each row runs `report` on a fresh scratch copy of its project from `tests/fixtures/summary/`, or on a new empty scratch folder for `empty`, after writing the row's lock files into `openspec/changes/003-running/.run/running/` of the copy, once with no args and once with `--json`
- **THEN** the text equals `tests/fixtures/summary/golden/<case>.txt` and the JSON equals `tests/fixtures/summary/golden/<case>.json`, byte for byte, and the `report-project` case also gives that JSON for the args `--json`, `--json`:

| Case | Project | Lock files | Completion rate |
|---|---|---|---|
| `empty` | none | none | `0` |
| `report-project` | `report-project` | none | `31.25` |
| `report-project-running` | `report-project` | `7.pid` holding `not json\n`, `8.pid` holding `{"pid":1,"startedAt":1}\n` | `31.25` |
| `all-done` | `all-done` | none | `100` |
| `thirds` | `thirds` | none | `66.67` |
| `history-project` | `history-project` | none | `0` |
| `sizes-project` | `sizes-project` | none | `0` |
| `coverage-project` | `coverage-project` | none | `0` |

### Requirement: Report history
`report` SHALL count history as TypeScript's `buildMetricsReport` does. It
SHALL read `read_task_history` once for each task it counts, in the order
it counts them. Each task's id is `<change folder>/<task id>`. It SHALL
read `read_rejection_planner` once for each rejected change entry it
lists. Then:

- `attempts`: `total` is the sum of `attempts`. `byTask` maps every
  counted task's id to its `attempts`. `multipleAttempts` lists the ids
  with more than 1 attempt, sorted by bytes.
- `unexplainedReruns`: `total` is the sum of `unexplained`. `byTask` maps
  the ids with more than 0 to their count.
- `deadByReason` counts each entry of every task's `dead_reasons`.
- `verifyRuns`: `total` is the number of `verify_codes` entries, and
  `missingExitCode` the number that are `None`. `byTask` maps the ids
  with any entry to their codes, `null` for `None`.
- `preSpawnVerify`: `runs`, `mismatches` and `missingPathRuns` are sums.
  `mismatchedTasks` lists the ids with more than 0 mismatches, sorted by
  bytes. `byStart` holds `red`, `green` and `any`, each with `runs` and
  `passed` summed.
- `cost`: `total` starts at 0 and adds every task's `costs` one value at
  a time, in task order. `perSpec` adds each change folder's values the
  same way and keeps only the folders whose sum is above 0. `coverage`
  holds `reportedAttempts`, the sum of `cost_reported_attempts`, and
  `totalAttempts`, the attempts total. `provenance` is
  `harness-reported`. `formattedTotal` is the reported cost text of the
  total and `reportedAttempts`.
- `retries`: `automatic` and `manual` each hold `count`, `reachedDone`,
  `cost` and `costReportedAttempts`, summed task by task. Each task's
  group cost is added to the running sum. `stuck` is the sum of `stuck`.
- `rejections`: `total` is the number of rejected entries that give a
  planner, and `byPlannerModel` counts each planner they give.
- `scopeRegressions` holds `detected`,
  `verificationPassedAtDetection`, `verificationFailedAtDetection`,
  `recertifiedByHuman`, `recertifiedAutomatically` and
  `requeuedForAgent`, the sums of `ScopeHistory`'s fields in that order.

The text SHALL follow the `  Completion rate:` line with a blank line,
`History:`, then:

- `  Total attempts: <n>`
- `  Tasks with multiple attempts: <n>`
- `  Unexplained re-runs: <n>`
- `  Verification runs: <n>`
- `  Verification runs missing exit code: <n>`
- `  Pre-spawn verify mismatches: <mismatches> of <runs> runs`
- `  Pre-spawn verify with missing paths: <missingPathRuns> of <runs> runs`
- `  Pre-spawn verify by declared start: red <p> of <r> passed, green <p> of <r> passed, any <p> of <r> passed`
- `  Automatic retries:`
- `  automatic: <count> retries, <reachedDone> reached done, cost <text> (<costReportedAttempts> of <count> attempts reported cost)`,
  then the same line for `manual`
- `  Stuck: <n>`
- `  Harness-reported cost: <formattedTotal> (<reportedAttempts> of <totalAttempts> attempts reported cost)`
- `  Dead by reason:`, then `    <reason>: <n>` for each reason, or
  `    (none)` when there are none
- `  Rejections: <n>`
- `  Rejections by planner model:`, then `    <model>: <n>` for each
  model, or `    (none)` when there are none
- `  Scope regressions:`, then `    Detected:`,
  `    Verification passed at detection:`,
  `    Verification failed at detection:`, `    Recertified by human:`,
  `    Recertified automatically:` and `    Requeued for agent:`, each
  followed by a space and its count.

Reasons and models SHALL be listed sorted by their lowercase text, by
bytes, with ties sorted by bytes. For names of lowercase letters, digits,
`-` and `.`, that is the order JavaScript's `localeCompare` gives.

#### Scenario: History of the history project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/history-project`
- **THEN** its lines include `  Total attempts: 8`, `  Unexplained re-runs: 1`, `  Pre-spawn verify by declared start: red 1 of 2 passed, green 1 of 1 passed, any 0 of 1 passed`, `  automatic: 2 retries, 1 reached done, cost $0.40 (1 of 2 attempts reported cost)`, `  Harness-reported cost: $4.70 (4 of 8 attempts reported cost)`, `    claude-opus: 1` and `    Requeued for agent: 1`, and its JSON's `history.cost.perSpec` is `{"101-alpha": 4, "102-beta": 0.7000000000000001}`

### Requirement: Report cost text
The reported cost text of a total and a reported count SHALL be
`not reported` when the total is 0 and the count is 0. Otherwise it is `$`
followed by the total written as JavaScript's `toFixed` writes it: with 2
decimals when the total is at least 0.01, else with 4 decimals. A tie
rounds away from zero.

#### Scenario: Reported cost texts
- **WHEN** a test runs `report` on a scratch root holding one active change `001-a` with `proposal.md`, `tasks/1.md` and `.run/events/1.jsonl` holding a `started` event, then the row's `tokens` event when there is one
- **THEN** the text's `  Harness-reported cost:` line ends with the row's text, and the JSON's `history.cost.perSpec` is the row's:

| Tokens cost | Text | perSpec |
|---|---|---|
| none | `not reported (0 of 1 attempts reported cost)` | `{}` |
| `0` | `$0.0000 (1 of 1 attempts reported cost)` | `{}` |
| `0.125` | `$0.13 (1 of 1 attempts reported cost)` | `{"001-a": 0.125}` |
| `0.005` | `$0.0050 (1 of 1 attempts reported cost)` | `{"001-a": 0.005}` |
| `-0.5` | `$-0.5000 (1 of 1 attempts reported cost)` | `{}` |

### Requirement: Report history blocks
`report` SHALL gather rework, executor disclosures and added dependencies
as TypeScript's `collectRework`, `collectDisclosures` and
`collectDependencies` do, over every change entry that is not rejected. A
change's id is the leading digits of its folder name padded with zeros to
at least three digits, or the whole folder name when it has none. Two ids
or folder names are ordered by their leading numbers when both have one
and the numbers differ, else by bytes.

- `rework`: for each entry, every id that storage's `read_change_fixes`
  gives names a fixed change, and the entry's id is one of its fixers.
  Each fixed id gives one entry `{change, fixedBy}`, with its distinct
  fixer ids in order, and the entries are in order of `change`.
- `disclosures`: each entry whose storage `read_result_disclosures` holds
  a section gives `{change, deviated, missingContext, outsideScope}`, the
  number of its disclosures holding each section. The entries are sorted
  by `change`, by bytes.
- `dependencies`: each entry for which storage's
  `read_dependencies_added` gives a pair gives `{change, added}`, with the
  folder name as `change` and `added` its pairs as `{file, name}`. The
  entries are in order of `change`.

The text SHALL follow the `    Requeued for agent:` line with `Rework:`,
then `  <change>: fixed by <fixedBy joined by ", ">` for each entry, or
`  (none)`; then `Executor disclosures:`, then
`  <change>: deviated <n>, missing context <n>, outside scope <n>` for
each entry, or `  (none)`; then, only when there is an entry,
`Dependencies added:` and `  <change>: <pairs>` for each, where each pair
is written `<name> (<file>)` and the pairs are joined by `, `.

#### Scenario: Blocks of the sizes project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/sizes-project`, with and without `--json`
- **THEN** its text holds these lines in this order, right after `    Requeued for agent: 0`, and its JSON's `history.rework`, `history.disclosures` and `history.dependencies` hold the same entries:

| Line |
|---|
| `Rework:` |
| `  001: fixed by 203` |
| `  201: fixed by 202` |
| `  abc: fixed by 203` |
| `Executor disclosures:` |
| `  201: deviated 1, missing context 0, outside scope 0` |
| `  202: deviated 0, missing context 1, outside scope 1` |
| `  203: deviated 1, missing context 0, outside scope 1` |
| `Dependencies added:` |
| `  202-second: anyhow (Cargo.toml), serde (Cargo.toml), zod (package.json)` |

#### Scenario: No blocks in the history project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/history-project`, with and without `--json`
- **THEN** its text holds `Rework:`, `  (none)`, `Executor disclosures:` and `  (none)` right after `    Requeued for agent: 1`, no line is `Dependencies added:`, and its JSON's `history` has no `rework`, `disclosures` or `dependencies` member

### Requirement: Report sizes
`report` SHALL measure task sizes as TypeScript's `buildMetricsReport`
does, from storage's `read_task_sizes` of every change entry that is not
rejected, and print them as its `formatMetricsReport` does. A task's
change is its entry's folder name. `round2(x)` is JavaScript's
`Math.round(x * 100) / 100`, which rounds a half up.

A size of at most 2 is in bucket `1-2`, at most 4 in `3-4`, at most 8 in
`5-8`, and any other in `over-8`. A bucket row for a list of tasks and a
size, scope files or acceptance lines, holds `bucket`, `tasks`, the
number of tasks in the bucket, `firstAttemptPassRate`, `round2` of the
share of those tasks whose first attempt passed, `meanAttempts`, `round2`
of their mean attempts, both 0 for an empty bucket, and
`medianDurationSeconds`, `round2` of the median of their known durations
in seconds, the mean of the two middle values for an even count, or null
when none is known. Every table lists the four buckets in that order.

`history.sizes` SHALL hold `byAcceptanceLines`, the rows of every
measured task by acceptance lines, and `scopeFileSeries`: first the
`legacy` series of the tasks whose resolver is `Legacy`, then the
`resolver-2` series of those whose resolver is `Second`. A task whose
resolver is `Other` is in no series. Each series holds `resolver`,
`byScopeFiles`, its rows by scope files, `startsAtChange`, the least
change of its tasks in the order of rust-report "Report history blocks"
for `resolver-2` and null for `legacy` or with no task, and
`largestFirstAttemptPass`. That is null when no task of the series passed
its first attempt, else `{change, task, title, scopeFiles,
acceptanceLines}` of the passing task with the most scope files, then the
most acceptance lines, then the least change and then the least task in
that order.

The text SHALL follow the blocks of "Report history blocks" with
`  Size by scope files (legacy):` and its table, then
`  Size by scope files (resolver-2):` and its table, then
`  Resolver 2 starts at: <startsAtChange>`, or `unavailable` for null,
then `  Size by acceptance lines:` and its table. A table is the line
`    bucket     tasks  first-attempt pass rate  mean attempts  median duration`
and then one line per row: four spaces, then the bucket padded to 10, a
space, the tasks padded to 6, a space, the pass rate padded to 23, a
space, the mean attempts padded to 14, a space, and the median as
TypeScript's `formatDuration` writes that many seconds times 1000, or
`unavailable` for null. Padding adds spaces on the right, and numbers are
written as JavaScript writes them.

The hint series is `resolver-2` when one of its rows has a task, else
`legacy`. When its largest first-attempt pass is not null, each limit
within 1 of that pass gives a part: `scope files <n> is within 1 of
configured maxScopeFiles <limit>` when `limits.maxScopeFiles` is, then
`acceptance lines <n> is within 1 of configured maxAcceptanceLines
<limit>` when `limits.maxAcceptanceLines` is. When there is a part, the
text ends with
`  Size hint: largest first-attempt pass <change>/<task> — <parts joined by "; ">`.

#### Scenario: Sizes of the sizes project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/sizes-project`, with and without `--json`
- **THEN** its text ends with these lines, and its JSON's `history.sizes.byAcceptanceLines` row `3-4` has `medianDurationSeconds` `52.78` and its `resolver-2` series row `3-4` has `45.56`:

| Line |
|---|
| `  Size by scope files (legacy):` |
| `    bucket     tasks  first-attempt pass rate  mean attempts  median duration` |
| `    1-2        1      1                       1              1m` |
| `    3-4        0      0                       0              unavailable` |
| `    5-8        1      0                       2              4m 30s` |
| `    over-8     0      0                       0              unavailable` |
| `  Size by scope files (resolver-2):` |
| `    bucket     tasks  first-attempt pass rate  mean attempts  median duration` |
| `    1-2        0      0                       0              unavailable` |
| `    3-4        1      0                       1              46s` |
| `    5-8        0      0                       0              unavailable` |
| `    over-8     1      1                       1              30m` |
| `  Resolver 2 starts at: 202-second` |
| `  Size by acceptance lines:` |
| `    bucket     tasks  first-attempt pass rate  mean attempts  median duration` |
| `    1-2        1      1                       1              unavailable` |
| `    3-4        2      0.5                     1              53s` |
| `    5-8        1      1                       1              30m` |
| `    over-8     1      0                       2              4m 30s` |
| `  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 8; acceptance lines 7 is within 1 of configured maxAcceptanceLines 7` |

#### Scenario: Size hints
- **WHEN** a test copies `tests/fixtures/summary/sizes-project` to a scratch folder, removes the row's event files, writes an `osq.toml` holding `[limits]` with the row's `maxScopeFiles` and `maxAcceptanceLines`, and runs `report`
- **THEN** the text's last line is the row's hint, or for `none` no line starts with `  Size hint:` and the last line is the `over-8` row of `  Size by acceptance lines:`:

| maxScopeFiles | maxAcceptanceLines | Removed event files | Hint |
|---|---|---|---|
| 8 | 7 | none | `  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 8; acceptance lines 7 is within 1 of configured maxAcceptanceLines 7` |
| 11 | 8 | none | `  Size hint: largest first-attempt pass 202-second/1 — acceptance lines 7 is within 1 of configured maxAcceptanceLines 8` |
| 9 | 5 | none | `  Size hint: largest first-attempt pass 202-second/1 — scope files 9 is within 1 of configured maxScopeFiles 9` |
| 6 | 10 | none | none |
| 9 | 3 | `archive/202-second/.run/events/1.jsonl` | none |
| 3 | 9 | `archive/202-second/.run/events/1.jsonl`, `203-third/.run/events/1.jsonl` | `  Size hint: largest first-attempt pass 201-first/1 — scope files 2 is within 1 of configured maxScopeFiles 3` |

Each removed path is under `openspec/changes/` of the copy.

### Requirement: Report validation
`report` SHALL summarize the latest validator run of each archived change it
counts, as TypeScript's `collectValidation` and `formatValidation` in
`src/core/report/report-validation.ts` do, from rust-storage "Latest
validation". With no archived change holding a readable run, it SHALL give
no section and no `validation` member. Otherwise, with `<changes>` the
changes with a run, `<validated>` those whose outcome is `validated`, and
`<findings>` the sum of their findings, it SHALL give `Validation:`,
`  <validated> of <changes> changes validated, <findings> findings`, and one
line per change in folder name order, by leading number and then by bytes:
`  <folder>: <findings> findings` for a validated run, and
`  <folder>: not validated (<outcome>)` for any other. The JSON member
`validation` SHALL hold `changes`, `validated`, `findings` and `perChange`,
one `{change, outcome, findings}` object per line, in the same order, where
`findings` is 0 for a run that is not validated.

#### Scenario: Validation of the coverage project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/coverage-project`
- **THEN** the text holds, after the History section and a blank line, exactly these lines, and the JSON's `validation` holds `changes` 4, `validated` 2, `findings` 2 and the rows as `perChange`:

| Line | Change | Outcome | Findings |
|---|---|---|---|
| `Validation:` | | | |
| `  2 of 4 changes validated, 2 findings` | | | |
| `  301-validated: 2 findings` | `301-validated` | `validated` | 2 |
| `  302-timed-out: not validated (timed_out)` | `302-timed-out` | `timed_out` | 0 |
| `  310-tie: not validated (failed)` | `310-tie` | `failed` | 0 |
| `  311-findings-not-a-list: 0 findings` | `311-findings-not-a-list` | `validated` | 0 |

#### Scenario: No validation section without a run
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/sizes-project`
- **THEN** the text holds no `Validation:` line and the JSON has no `validation` member

### Requirement: Report coverage
`report` SHALL count, for every task file of every change it counts, whether
the task has an event file, as TypeScript's `buildMetricsReport` in
`src/core/report/report.ts` builds `coverage`, from rust-storage "Task event
files", and SHALL give `Coverage:`, `  Tasks with event files: <with>` and
`  Tasks without event files: <without>`. The JSON member `coverage` SHALL
hold `withEvents` and `withoutEvents`, those two counts; `byChange`, one
member per change folder holding at least one task file, named by its
folder, holding `withEvents` and `withoutEvents`, its task ids in each
group, ordered by leading number and then by bytes; and, when rust-storage
"Capability sidecars" gives a split, `capabilities` holding its
`withSidecar` and `withoutSidecar` names.

#### Scenario: Coverage of the coverage project
- **WHEN** a test runs `report` on a scratch copy of `tests/fixtures/summary/coverage-project`
- **THEN** the text ends with `Coverage:`, `  Tasks with event files: 3` and `  Tasks without event files: 4`, and the JSON's `coverage` holds `withEvents` 3, `withoutEvents` 4, `capabilities` with `withSidecar` `["alpha"]` and `withoutSidecar` `["beta"]`, and `byChange` with exactly the rows:

| Change | withEvents | withoutEvents |
|---|---|---|
| `301-validated` | `["1"]` | `["2"]` |
| `302-timed-out` | `[]` | `["1"]` |
| `303-unreadable` | `[]` | `["1"]` |
| `305-active` | `["2","10"]` | `["1"]` |

#### Scenario: Coverage with no living spec
- **WHEN** a test runs `report` on a new empty scratch folder
- **THEN** the text ends with `Coverage:`, `  Tasks with event files: 0` and `  Tasks without event files: 0`, and the JSON's `coverage` is `{"byChange":{},"withEvents":0,"withoutEvents":0}` with no `capabilities` member
