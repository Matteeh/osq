## MODIFIED Requirements

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

## ADDED Requirements

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
