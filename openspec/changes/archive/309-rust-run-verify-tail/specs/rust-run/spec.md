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
is empty.

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
| `markerOutputLines = 2`, `markerLineChars = 5` under `[limits]` | task | `printf 'one\ntwo\nthree-long\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\ntwo\nthree… (5 more characters)\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `two\nthree… (5 more characters)` | `1-1.log` |
| none | task | `printf 'ok\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\nok\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `ok\n` | `1-1.log` |
| none | task | `exit 1` | `verify_red` | `Watcher independent verify failed:\nProcess exited with code 1\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | none | `1-1.log` |
| `markerOutputLines = 1` under `[limits]` | task | `printf 'a\n✖ failing tests:\nb\nc\n'; exit 1` | `verify_red` | `Watcher independent verify failed:\n✖ failing tests:\nb\nc\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `c` | `1-1.log` |
| `markerOutputLines = 2` under `[limits]`, `taskTimeoutSeconds = 1` under `[timeouts]` | task | `printf 'x\ny\nz\n'; sleep 5` | `verify_red` | `Watcher independent verify timed out:\ny\nz\nFull output: .run/logs/1-1.log\n` | `1.jsonl` | `y\nz` | `1-1.log` |
| `markerOutputLines = 2` under `[limits]` | proposal | `printf 'one\ntwo\nthree\n'; exit 2` | `change_verify_red` | `Change-level verification failed after task verification passed.\ntwo\nthree\nFull output: .run/logs/change-1.log\n` | `change.jsonl` | `two\nthree` | `change-1.log` |
