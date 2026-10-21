# Spec Delta: rust-harnesses

## ADDED Requirements

### Requirement: Process runner
`run_process(spec, on_line)` in `osq-kernel-harnesses` SHALL start
`spec.program` with `spec.args`, in the folder `spec.cwd`, with exactly
the variables in `spec.env` and no other variable of the calling
process (ADR 007), with stdin closed and stdout and stderr read by the
runner. `spec` is a `ProcessSpec` with the fields `program`, `args`,
`cwd`, `env` (a `BTreeMap<String, String>`), `timeout` (an
`Option<Duration>`, `None` for no timeout) and `kill_grace` (a
`Duration`). `on_line` is a `&mut dyn FnMut(&str)`.

- Each stdout line SHALL be passed to `on_line` on the calling thread,
  in the order the program wrote them, while the program runs, without
  its `\n`. A line that is empty or holds only whitespace SHALL NOT be
  passed. A last line with no `\n` SHALL be passed. Bytes that are not
  UTF-8 are replaced, as `String::from_utf8_lossy` does.
- Stderr SHALL be collected whole into the outcome's `stderr`, read
  while the program runs so a full pipe never blocks it.
- When `timeout` is set and the program still runs that long after it
  started, the runner SHALL ask it to stop with `SIGTERM`, and SHALL
  kill it with `SIGKILL` when it still runs `kill_grace` later. The run
  then counts as timed out.
- After the program exits, the runner SHALL wait at most `kill_grace`
  for its stdout to close, so a background child that keeps stdout open
  does not hold the run.

The result SHALL be a `ProcessOutcome` with `exit_code` (an `i32`),
`timed_out` and `stderr`. A run that did not time out has the program's
exit code, or `1` when a signal ended it. A timed-out run has the
program's exit code when it has one other than `0`, and `124`
otherwise. A program that cannot be started SHALL be
`ProcessError::Spawn { program, message }`, with `message` the
operating system's error text, and `on_line` is never called.

#### Scenario: Runs of small scripts
- **WHEN** `run_process` runs `/bin/sh` with the arguments `-c` and each script below, in a new temporary folder, with the row's environment, a `kill_grace` of 300 milliseconds and the row's timeout
- **THEN** `on_line` receives the row's lines in order, the outcome has the row's exit code and timed-out flag, and each run returns in under 5 seconds:

| Script | Environment | Timeout | Lines | Exit code | Timed out |
|---|---|---|---|---|---|
| `printf 'one\ntwo\n'` | none | none | `one`, `two` | 0 | false |
| `exit 7` | none | none | none | 7 | false |
| `printf 'a\n\n   \nb'` | none | none | `a`, `b` | 0 | false |
| `printf '%s\n' "${OSQ_PROBE-unset}" "${CARGO_MANIFEST_DIR-unset}"` | `OSQ_PROBE=probe` | none | `probe`, `unset` | 0 | false |
| `kill -KILL $$` | none | none | none | 1 | false |
| `trap 'exit 0' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done` | none | 300 ms | `started` | 124 | true |
| `trap 'echo stopping; exit 3' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done` | none | 300 ms | `started`, `stopping` | 3 | true |
| `trap '' TERM; echo started; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done` | none | 300 ms | `started` | 124 | true |
| `(sleep 10) & echo done` | none | none | `done` | 0 | false |

#### Scenario: Stderr, folder and stop timing
- **WHEN** `run_process` runs `/bin/sh -c 'echo err >&2; pwd -P; exit 2'` in a new temporary folder with no variables, and runs the `trap 'echo stopping; exit 3' TERM` row above with a `kill_grace` of 5 seconds
- **THEN** the first outcome has exit code 2 and `stderr` `err\n`, and its one line is the folder's canonical path; the second returns in under 5 seconds, since the program stopped on `SIGTERM` before the grace passed

#### Scenario: Program that cannot start
- **WHEN** `run_process` runs the program `/nonexistent/osq-program`
- **THEN** it returns `ProcessError::Spawn` naming `/nonexistent/osq-program`, and `on_line` is never called

### Requirement: Pi arguments
`pi_args(settings, prompt)` in `osq-kernel-harnesses` SHALL return pi's
arguments for one headless task run, as TypeScript's `buildPiArgs`
builds them: `--mode`, `json`, `--no-session`, `--no-approve`,
`--offline`, `--no-extensions`, `--no-skills` and
`--no-prompt-templates`, then `--provider <provider>`, `--model
<model>` and `--thinking <thinking>` in that order for each setting
that is set and not blank after trimming, given trimmed, then `--` and
`prompt` as one argument. `settings` is a `PiSettings` with the
`Option<String>` fields `provider`, `model` and `thinking`; choosing
them is the runners' work.

#### Scenario: Arguments for pi settings
- **WHEN** `pi_args` builds the arguments for each row's settings and the prompt `Do task 1.\nThen exit.`
- **THEN** it returns the eight base arguments followed by the row's arguments, the prompt last as one argument:

| Provider | Model | Thinking | Arguments after the base |
|---|---|---|---|
| none | none | none | `--`, prompt |
| `deepseek` | `deepseek-flash` | `high` | `--provider`, `deepseek`, `--model`, `deepseek-flash`, `--thinking`, `high`, `--`, prompt |
| `  deepseek  ` | empty | `   ` | `--provider`, `deepseek`, `--`, prompt |
| none | `m1` | none | `--model`, `m1`, `--`, prompt |

### Requirement: Pi stream events
`pi_line_events(line, project_root, state)` in `osq-kernel-harnesses`
SHALL turn one line of pi's `--mode json` stdout into the core `Event`s
TypeScript's `processPiStdoutLine` writes for it, in the same order,
without timestamps; writing them is not this kernel's work. `state` is
a `PiStreamState`, created with `Default`, that remembers tool calls
across lines, and its `settled()` SHALL be true once a line of type
`agent_settled` was read. A field counts below only when it has the
named JSON kind; a string counts only when it is not empty.

- A line that is blank after trimming, is not JSON or is not a JSON
  object gives no event, and so does any `type` not named below.
- `tool_execution_start` gives one `Tool` event. Its `tool` is
  `toolName`, or `tool` without one. Its summary is `args.command` for
  `bash`; `args.path` for `read`, `edit` and `write`; `args.pattern`,
  else `args.path`, for `grep`, `find` and `ls`; and the compact JSON
  text of `args` for any other tool, `{}` when `args` is not an object.
  A missing value gives an empty summary. The summary is cut to its
  first 60 characters and then the project root is stripped: with
  trailing `/` and `\` removed from the root, unless the root is empty,
  `/` or `\`, every `<root>/` and `<root>\` is removed, and then every
  `<root>` followed by the end, whitespace or one of `"'()[]{},;:` is
  replaced by `.`. With a `toolCallId`, the call's tool and its
  `args.path` are remembered.
- `tool_execution_end` whose `isError` is exactly `false` gives one
  `FileChanged` event when its tool, the remembered one for its
  `toolCallId`, else its `toolName`, is `edit` or `write`, and it has a
  path, the remembered one, else `args.path`. An absolute path is made
  relative to the project root as Node's `path.relative` does, `..`
  for each root folder it leaves; a relative path is kept as written.
- `message_end` whose `message.role` is `assistant` gives a `Text`
  event when `message.content` is an array holding parts of type
  `text` with text, their texts joined by `\n`, and then a `Tokens`
  event when `message.usage` is an object: `promptTokens` from
  `input`, `candidateTokens` from `output`, each 0 when absent,
  `totalTokens` from `totalTokens`, else their sum, and `cachedTokens`
  from `cacheRead`, `reasoningTokens` from `reasoning`, `cost` from
  `usage.cost.total` as written, `provider` from `message.provider`
  and `model` from `message.model`, each only when present.
- `auto_retry_start` and `auto_retry_end` give one `HarnessRetry`
  event with `phase` `start` or `end`, `attempt` from `attempt`, else
  0, `maxAttempts` and `delayMs` when present, `success` when it is a
  boolean, and `error` from the first of `errorMessage`, `finalError`
  and `error` that is present.

A token count, `attempt`, `maxAttempts` or `delayMs` counts only when it
is a whole number of at least 0; any other number counts as absent.

#### Scenario: Captured pi run matches TypeScript
- **WHEN** each line of `crates/kernel/harnesses/tests/fixtures/pi/pi-run.jsonl`, a captured pi run, is read in order with the project root `/work/project` and one state
- **THEN** the events, each with its 1-based line number, its `type` and its `data`, equal `crates/kernel/harnesses/tests/golden/pi-run-events.json`, which TypeScript's `processPiStdoutLine` wrote for the same lines, and the state is settled after the last line and not before it

#### Scenario: Edge lines match TypeScript
- **WHEN** each line of `crates/kernel/harnesses/tests/fixtures/pi/pi-edges.jsonl` is read in order with the project root `/work/project` and one state
- **THEN** the events, each with its 1-based line number, its `type` and its `data`, equal `crates/kernel/harnesses/tests/golden/pi-edges-events.json`, which TypeScript's `processPiStdoutLine` wrote for the same lines

#### Scenario: Counts that are not whole numbers
- **WHEN** the line `{"type":"message_end","message":{"role":"assistant","usage":{"input":1.5,"output":-2,"totalTokens":3}}}` is read
- **THEN** it gives one `Tokens` event with `promptTokens` 0, `candidateTokens` 0, `totalTokens` 3 and no other field
