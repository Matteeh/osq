## ADDED Requirements

### Requirement: Pre-spawn verify
When the attempt "Run attempts" reads is 1, `run` SHALL run the task's
verify once with rust-harnesses `run_verify` after the approval check and
before it snapshots the tree for the scope audit and starts pi, in the
tree the task runs in, with the timeout and environment the task's verify
gets in "Run verdict", as TypeScript's `runPreSpawnVerify` does with
`gates.preSpawnVerify` set to `fail`. It writes that run's log and
appends its `verify_ran` event to `.run/events/<task>.jsonl` as "Run
verdict" does, with `phase` `pre_spawn`, `expected` the task's
`verify_starts`, `missingPaths` when the verify names paths the tree
lacks, and `mismatch`.

The named paths are the operands TypeScript's `listNamedPaths` picks from
the command, each once in command order: tokens split at whitespace
outside quotes with the quotes dropped, keeping a token that holds `/` or
`\` and does not start with `-` or `/`, hold `=`, or start with a URL
scheme. A named path is missing when nothing exists at it, or, for a
pattern holding `*` or `?`, when rust-loop `scope_files` resolves it to
no regular file. A run passes when it exits 0 without timing out. The
start mismatches when `verify_starts` is `red` and the run passes with no
missing path, or when it is `green` and the run fails; `any` never
mismatches.

A mismatch SHALL kill the task as `verify_precondition` before pi starts,
with the dead marker `---\nreason: verify_precondition\ncommand:
"<verify>"\nexpected: <verify_starts>\nexit_code: <code>\n---\nPre-spawn
verify precondition not met (expected <verify_starts>, exit code
<code>):\n<excerpt>\n`, where `<excerpt>` is the "Run verdict" excerpt of
the run's output with its log as the source. A later attempt runs no
pre-spawn verify; the first attempt's event stays the task's record.

#### Scenario: Pre-spawn verify outcomes
- **WHEN** `run` runs with the arguments `1`, `1` on the "Run outcomes" repository with `fake-pi-mode` holding `done`, whose task 1 has the row's `verify_starts` and `verify`, and whose `.run/approved` holds the change folder's new seal
- **THEN** the task ends as the row says, and the first `verify_ran` event of `.run/events/1.jsonl` has `phase` `pre_spawn`, `expected` the row's start, the row's `mismatch`, the row's `missingPaths` or none, and `log` `.run/logs/1-1.log`:

| Start | Verify | `mismatch` | `missingPaths` | Result |
|---|---|---|---|---|
| `red` | `test -f src/a.txt` | false | none | done |
| `red` | `true` | true | none | `verify_precondition` |
| `red` | `true src/a.txt` | false | `src/a.txt` | done |
| `red` | `true src/*.txt` | true | none | `verify_precondition` |
| `red` | `true src/gen/*.rs` | false | `src/gen/*.rs` | done |
| `green` | `true` | false | none | done |
| `green` | `test -f src/a.txt` | true | none | `verify_precondition` |
| `green` | `true src/a.txt` | false | `src/a.txt` | done |
| `any` | `true` | false | none | done |
| `any` | `test -f src/a.txt` | false | none | done |

#### Scenario: Pre-spawn marker
- **WHEN** `run` runs with the arguments `1`, `1` on the "Run outcomes" repository with `fake-pi-mode` holding `done`, whose task 1 has the row's `verify_starts` and `verify`, and whose `.run/approved` holds the change folder's new seal
- **THEN** the task dies as `verify_precondition`, `.run/events/1.jsonl` holds no `started` event, and `.run/dead/1.md` is the row's marker, where `\n` stands for a newline:

| Start | Verify | Marker |
|---|---|---|
| `red` | `true` | `---\nreason: verify_precondition\ncommand: "true"\nexpected: red\nexit_code: 0\n---\nPre-spawn verify precondition not met (expected red, exit code 0):\n(no output)\nFull output: .run/logs/1-1.log\n` |
| `green` | `echo no; exit 3` | `---\nreason: verify_precondition\ncommand: "echo no; exit 3"\nexpected: green\nexit_code: 3\n---\nPre-spawn verify precondition not met (expected green, exit code 3):\nno\nFull output: .run/logs/1-1.log\n` |

#### Scenario: Pre-spawn named paths
- **WHEN** `run` runs with the arguments `1`, `1` on the "Run outcomes" repository with `fake-pi-mode` holding `done`, whose task 1 has `verify_starts: any` and the row's `verify`, and whose `.run/approved` holds the change folder's new seal
- **THEN** the first `verify_ran` event of `.run/events/1.jsonl` has the row's `missingPaths`, or none, however the task ends:

| Verify | `missingPaths` |
|---|---|
| `true src/a.txt src/a.txt` | `src/a.txt` |
| `true "src/b c.txt" 'src/d.txt'` | `src/b c.txt`, `src/d.txt` |
| `true --out=src/x.txt -o src/keep.txt /src/a.txt https://h/p.txt` | none |
| `bin/check src/keep.txt` | `bin/check` |
| `true src/tests src/*.txt src/gen/*.rs` | `src/gen/*.rs` |

#### Scenario: Pre-spawn verify on a later attempt
- **WHEN** `run` runs with the arguments `1`, `1` on the "Run outcomes" repository with `fake-pi-mode` holding `done`, whose task 1 has `verify_starts: red` and the verify `true`, after writing the `retry 2` line of rust-run "Prior context handed to pi" to `.run/events/1.jsonl` and its `1.1.md` marker to `.run/dead/`, and whose `.run/approved` holds the change folder's new seal
- **THEN** the task is done, no `verify_ran` event of `.run/events/1.jsonl` has a `phase`, and the last one has `log` `.run/logs/1-1.log`

## MODIFIED Requirements

### Requirement: Run verdict
After the audit, `run` SHALL kill the task as `no_result` without
`.run/results/<task>.md`, as `blocked` when its `## Blocked` section has
text, then run the task's verify and the proposal's verify with
rust-harnesses `run_verify`, appending a `verify_ran` event to the task's
and to `change.jsonl`, and kill it as `verify_red` or `change_verify_red`
when one fails.

Each verify's whole output SHALL go to the next free
`.run/logs/<target>-<n>.log` of the change folder, where `<target>` is the
task for the task's verify and `change` for the proposal's, and `<n>` is
one more than the count of `<target>-<digits>.log` files already there,
with a `.gitignore` holding `*` and a newline written in `.run/logs/` when
it is missing, as TypeScript's `writeVerifyLog` does. The `verify_ran`
event SHALL hold that path as `log`, and as `output` the tail TypeScript's
`tailVerifyOutput` keeps with `limits.markerOutputLines` and
`limits.markerLineChars` from the config, with no `output` when the tail
is empty. On a first attempt the "Pre-spawn verify" log is already there,
so the task's verify writes the task's second log.

A dead marker's body SHALL hold the excerpt TypeScript's
`excerptVerifyOutput` builds with the same two limits and the log path as
its source: the lines from the last line that starts with `✖ failing
tests:` after its leading whitespace, or else the last
`limits.markerOutputLines` lines, after trailing whitespace is dropped,
each cut to `limits.markerLineChars` characters followed by `… (<rest>
more characters)`, then `Full output: <log>`. Empty output gives `(no
output)` in place of the lines. A red task verify that did not time out
and printed nothing gives the excerpt of `Process exited with code
<code>`, as TypeScript does. A timed-out task verify keeps the excerpt of
its output under `Watcher independent verify timed out:`. No tail size is
a constant in the run crate.

#### Scenario: Run outcomes
- **WHEN** `run` runs with the arguments `1`, `1` on a git repository made in a new folder under `CARGO_TARGET_TMPDIR` from `crates/features/run/tests/fixtures/run-project/`, all committed, with an `osq.toml` naming the executor harness `pi` and the crate's fake pi as `pi.bin`, `.run/approved` holding the change folder's seal, and `fake-pi-mode` holding the row's mode
- **THEN** the task ends as the row says:

| Mode | The fake pi | Result |
|---|---|---|
| `done` | writes `src/a.txt` and the result file | done |
| `no-file` | writes the result file | `verify_red` |
| `breaks-change` | writes `src/a.txt`, `src/broken.txt` and the result file | `change_verify_red` |
| `no-result` | writes `src/a.txt` | `no_result` |
| `blocked` | writes `src/a.txt` and a result file with `## Blocked` holding `need a key` | `blocked` |
| `outside` | writes `src/a.txt`, `other.txt` and the result file | `scope_violation` |
| `frozen` | writes `src/a.txt`, changes `src/tests/old.rs` and writes the result file | `undeclared_test_change` |
| `crash` | exits 3 | `crashed` |
| `crash-after-result` | writes `src/a.txt` and the result file, then exits 3 | done |

#### Scenario: Verify output from the config
- **WHEN** `run` runs with the arguments `1`, `1` on the "Run outcomes" repository with `fake-pi-mode` holding `done`, whose `osq.toml` also holds the row's settings, whose task 1 or proposal has the row's shell command as its `verify`, and whose `.run/approved` holds the change folder's new seal
- **THEN** the task dies with the row's reason, the dead marker's text after its closing `---` line is the row's body, the last `verify_ran` event of the row's stream holds the row's `output`, or none, and `log` `.run/logs/<log>`, that log holds the command's whole output, and `.run/logs/.gitignore` holds `*` and a newline, where `\n` stands for a newline and every body ends with one:

| Settings | Verify | Command | Reason | Body | Stream | `output` | Log |
|---|---|---|---|---|---|---|---|
| `markerOutputLines = 2`, `markerLineChars = 5` under `[limits]` | task | `printf 'one\ntwo\nthree-long\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\ntwo\nthree… (5 more characters)\nFull output: .run/logs/1-2.log\n` | `1.jsonl` | `two\nthree… (5 more characters)` | `1-2.log` |
| none | task | `printf 'ok\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\nok\nFull output: .run/logs/1-2.log\n` | `1.jsonl` | `ok\n` | `1-2.log` |
| none | task | `exit 1` | `verify_red` | `Watcher independent verify failed:\nProcess exited with code 1\nFull output: .run/logs/1-2.log\n` | `1.jsonl` | none | `1-2.log` |
| `markerOutputLines = 1` under `[limits]` | task | `printf 'a\n✖ failing tests:\nb\nc\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\n✖ failing tests:\nb\nc\nFull output: .run/logs/1-2.log\n` | `1.jsonl` | `c` | `1-2.log` |
| `markerOutputLines = 2` under `[limits]`, `taskTimeoutSeconds = 1` under `[timeouts]` | task | `printf 'x\ny\nz\n'; sleep 5` | `verify_red` | `Watcher independent verify timed out:\ny\nz\nFull output: .run/logs/1-2.log\n` | `1.jsonl` | `y\nz` | `1-2.log` |
| `markerOutputLines = 2` under `[limits]` | proposal | `printf 'one\ntwo\nthree\n'; exit 2` | `change_verify_red` | `Change-level verification failed after task verification passed.\ntwo\nthree\nFull output: .run/logs/change-1.log\n` | `change.jsonl` | `two\nthree` | `change-1.log` |
