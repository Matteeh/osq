# rust-harnesses Specification

## Purpose
The harnesses kernel starts one harness tool per role, such as Claude Code, OpenCode or Pi, passes it the prompt, and translates its stream into events.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/harnesses/** -->
The rust-harnesses capability SHALL own the `osq-kernel-harnesses`
crate: its manifest, its source, its tests and their fixtures.

#### Scenario: Harnesses crate ownership
- **WHEN** file ownership is resolved for the harnesses kernel
- **THEN** system maps `crates/kernel/harnesses/**` to rust-harnesses

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

### Requirement: Process stop after a line
`run_process_until(spec, on_line)` in `osq-kernel-harnesses` SHALL run
one program as `run_process` does, with `on_line` a
`&mut dyn FnMut(&str) -> bool`. The first time `on_line` returns `true`,
the runner SHALL ask the program to stop with `SIGTERM` when it still
runs `spec.kill_grace` later, and SHALL kill it with `SIGKILL` when it
still runs `spec.kill_grace` after that; a later `true` does not move
either deadline. A stop SHALL NOT count as a timeout: the outcome has
the program's exit code, or `1` when a signal ended it, and `timed_out`
false. When `spec.timeout` passes before the program exits, the run
times out as `run_process` says, stop or no stop. `run_process` SHALL
behave as `run_process_until` with an `on_line` that returns `false`.

#### Scenario: Stop after a settled line
- **WHEN** `run_process_until` runs `/bin/sh` with the arguments `-c` and each script below, in a new temporary folder, with no variables, a `kill_grace` of 300 milliseconds and no timeout, and `on_line` returns `true` for the line `settled` and `false` for any other line
- **THEN** `on_line` receives the row's lines in order, the outcome has the row's exit code and `timed_out` false, and each run returns in under 5 seconds and no sooner than the row's least duration:

| Script | Lines | Exit code | Least duration |
|---|---|---|---|
| `trap 'echo stopping; exit 5' TERM; echo settled; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done` | `settled`, `stopping` | 5 | 300 ms |
| `trap '' TERM; echo settled; i=0; while [ $i -lt 100 ]; do sleep 0.1; i=$((i+1)); done` | `settled` | 1 | 600 ms |
| `echo settled; echo after` | `settled`, `after` | 0 | none |
| `trap 'echo stopping; exit 5' TERM; echo working; i=0; while [ $i -lt 10 ]; do sleep 0.1; i=$((i+1)); done` | `working` | 0 | 900 ms |

### Requirement: Pi binary
`resolve_pi_binary(setting, env)` in `osq-kernel-harnesses` SHALL return
the pi program as TypeScript's `resolvePiBinary` does, from inputs its
caller gives: `setting` (an `Option<&str>`, the configured binary)
trimmed when it is set and not blank, else the variable `OSQ_PI_PATH`
of `env` (a `&BTreeMap<String, String>`, the caller's environment)
trimmed when it is set and not blank, else `pi`.

#### Scenario: Binary choices
- **WHEN** `resolve_pi_binary` runs with each row's setting and environment
- **THEN** it returns the row's program:

| Setting | `OSQ_PI_PATH` | Program |
|---|---|---|
| `  /opt/pi/bin/pi  ` | `/env/pi` | `/opt/pi/bin/pi` |
| `   ` | ` /env/pi ` | `/env/pi` |
| none | `/env/pi` | `/env/pi` |
| none | `  ` | `pi` |
| none | not set | `pi` |

### Requirement: Pi version assessment
`assess_pi_version(raw, range)` in `osq-kernel-harnesses` SHALL assess
one `pi --version` text as TypeScript's `assessPiVersion` does, against
a tested range its caller gives. `range` is a `PiVersionRange` with the
fields `min` and `max`, each a `[u64; 3]`; its `Display` writes
`>=<min> <<max>`, each version as its three parts joined by `.`, such
as `>=0.87.0 <0.88.0`. The result SHALL be a `PiVersionAssessment` with
`version` (a `String`), `tested` (a `bool`) and `warning` (an
`Option<String>`):

- `version` is `raw` trimmed, then its first line trimmed.
- The first run of digits, `.`, digits, `.` and digits in `version`
  gives its three parts as whole numbers; a part too large for a `u64`
  counts as no run.
- `tested` is true when the parts are at least `min` and less than
  `max`, compared part by part from the first; `warning` is then
  absent.
- With no run, `warning` is `Pi version "<version>" is outside the
  tested range <range>`; outside the range it is `Pi <version> is
  outside the tested range <range>`.

#### Scenario: Versions against the tested range
- **WHEN** `assess_pi_version` assesses each row's text against the range with `min` `[0, 87, 0]` and `max` `[0, 88, 0]`
- **THEN** it returns the row's version, tested flag and warning:

| Text | Version | Tested | Warning |
|---|---|---|---|
| `0.87.3\n` | `0.87.3` | true | none |
| `  pi 0.87.0 (build 5)\nextra` | `pi 0.87.0 (build 5)` | true | none |
| `v0.87.12-beta` | `v0.87.12-beta` | true | none |
| `0.88.0` | `0.88.0` | false | `Pi 0.88.0 is outside the tested range >=0.87.0 <0.88.0` |
| `0.86.99` | `0.86.99` | false | `Pi 0.86.99 is outside the tested range >=0.87.0 <0.88.0` |
| `0.9.0` | `0.9.0` | false | `Pi 0.9.0 is outside the tested range >=0.87.0 <0.88.0` |
| `1.0.0` | `1.0.0` | false | `Pi 1.0.0 is outside the tested range >=0.87.0 <0.88.0` |
| `1.2` | `1.2` | false | `Pi version "1.2" is outside the tested range >=0.87.0 <0.88.0` |
| empty | empty | false | `Pi version "" is outside the tested range >=0.87.0 <0.88.0` |
| `0.99999999999999999999.0` | `0.99999999999999999999.0` | false | `Pi version "0.99999999999999999999.0" is outside the tested range >=0.87.0 <0.88.0` |

### Requirement: Pi preflight
`preflight_pi(request)` in `osq-kernel-harnesses` SHALL check pi before
a run as TypeScript's `preflightPi` does, with every input from its
caller. `request` is a `PiPreflight` with the fields `bin` (a
`String`), `provider` (an `Option<String>`), `cwd` (a `PathBuf`), `env`
(a `BTreeMap<String, String>`), `timeout` and `kill_grace` (each a
`Duration`) and `range` (a `PiVersionRange`). Each program it starts
runs through `run_process` with `request`'s `cwd`, `env`, `timeout` and
`kill_grace`.

- It SHALL run `<bin> --version`. When that run cannot start, or exits
  other than 0, which includes a timeout, it SHALL fail with
  `PiPreflightError::Binary { bin }`, displayed `Pi binary not found or
  failed: <bin>`. Otherwise the version text is the first stdout line,
  else the first stderr line that is not blank, else empty.
- On success it SHALL return a `PiReady` with `version` and `warning`
  from `assess_pi_version` on that text and `request.range`; printing
  the warning is the caller's work.
- When `provider` trimmed is set and not blank, it SHALL then run
  `<bin> auth check --provider <provider> --json` with the trimmed
  provider, as TypeScript's `runPiAuthCheck` does. Its stdout lines,
  joined by `\n`, are read as a JSON object; any other text counts as
  no object. A field counts only when it is a string that is not blank,
  and is trimmed. The run fails when it cannot start, times out or
  exits other than 0. The status is the object's `status`, else `error`
  when the run failed, else `unknown`. The reason is the object's
  `reason`, else, when the run failed, the start error's display, `pi
  auth check timed out`, or `pi auth check exited with code <code>`.
- A status other than `ready` SHALL fail with
  `PiPreflightError::Credentials { provider, detail }`, `detail` the
  reason, else the status, displayed `Pi credentials not ready for
  provider <provider>: <detail>. Run: pi auth check --provider
  <provider>`.

The fake pi programs the harness tests run,
`crates/kernel/harnesses/tests/fixtures/fake-pi/preflight.sh` and
`crates/kernel/harnesses/tests/fixtures/fake-pi/run.sh`, SHALL be
committed executable and run in place by their absolute path, never
copied or written by a test. Writing an executable and then starting it
while other tests fork can fail with `ETXTBSY`, as 251's mutation
baseline did. A test that needs a program named `pi` on a `PATH` SHALL
use a symlink or a `PATH` entry that points at the committed file.

#### Scenario: Preflight with a fake pi
- **WHEN** `preflight_pi` runs `crates/kernel/harnesses/tests/fixtures/fake-pi/preflight.sh` in place as `bin`, with a new temporary folder as `cwd`, a `timeout` of 2 seconds, a `kill_grace` of 300 milliseconds, the range `>=0.87.0 <0.88.0`, the row's provider and exactly the row's variables; for `--version` the fake prints `FAKE_PI_VERSION` to stdout and `FAKE_PI_VERSION_STDERR` to stderr, each when not empty, and exits with `FAKE_PI_VERSION_EXIT`, else 0; for `auth` it writes its arguments one per line to `auth-args.txt` in its working directory, waits 10 seconds when `FAKE_PI_AUTH_WAIT` is `1`, prints `FAKE_PI_AUTH` when it is not empty, and exits with `FAKE_PI_AUTH_EXIT`, else 0
- **THEN** each run returns the row's result in under 5 seconds:

| Provider | Variables | Result |
|---|---|---|
| none | `FAKE_PI_VERSION=0.87.1` | `PiReady` with version `0.87.1` and no warning, and no `auth-args.txt` |
| `   ` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH_EXIT=1` | `PiReady` with version `0.87.1` and no warning, and no `auth-args.txt` |
| none | `FAKE_PI_VERSION=0.90.0` | `PiReady` with version `0.90.0` and the warning `Pi 0.90.0 is outside the tested range >=0.87.0 <0.88.0` |
| none | `FAKE_PI_VERSION_STDERR=0.87.2` | `PiReady` with version `0.87.2` and no warning |
| none | none | `PiReady` with an empty version and the warning `Pi version "" is outside the tested range >=0.87.0 <0.88.0` |
| none | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_VERSION_EXIT=2` | `Pi binary not found or failed: <the fake's path>` |
| ` deepseek ` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH={"status":"ready","provider":"deepseek"}` | `PiReady` with version `0.87.1`, and `auth-args.txt` holds `auth`, `check`, `--provider`, `deepseek`, `--json` |
| `deepseek` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH={"status":"missing","reason":"No API key found for deepseek"}`, `FAKE_PI_AUTH_EXIT=1` | `Pi credentials not ready for provider deepseek: No API key found for deepseek. Run: pi auth check --provider deepseek` |
| `deepseek` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH={"status":"expired","reason":"  "}`, `FAKE_PI_AUTH_EXIT=2` | `Pi credentials not ready for provider deepseek: expired. Run: pi auth check --provider deepseek` |
| `deepseek` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH=not json` | `Pi credentials not ready for provider deepseek: unknown. Run: pi auth check --provider deepseek` |
| `deepseek` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH=["ready"]` | `Pi credentials not ready for provider deepseek: unknown. Run: pi auth check --provider deepseek` |
| `deepseek` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH_EXIT=3` | `Pi credentials not ready for provider deepseek: pi auth check exited with code 3. Run: pi auth check --provider deepseek` |
| `deepseek` | `FAKE_PI_VERSION=0.87.1`, `FAKE_PI_AUTH_WAIT=1` | `Pi credentials not ready for provider deepseek: pi auth check timed out. Run: pi auth check --provider deepseek` |

#### Scenario: Pi binary that cannot start
- **WHEN** `preflight_pi` runs with the `bin` `/nonexistent/pi`
- **THEN** it fails with `PiPreflightError::Binary`, displayed `Pi binary not found or failed: /nonexistent/pi`

#### Scenario: Fake pi programs run in place
- **WHEN** a test reads the modes of `crates/kernel/harnesses/tests/fixtures/fake-pi/preflight.sh` and `crates/kernel/harnesses/tests/fixtures/fake-pi/run.sh`
- **THEN** each mode has the owner, group and other execute bits set

### Requirement: Pi harness
`PiHarness` in `osq-kernel-harnesses` SHALL implement the runners
kernel's `Harness` port for pi, running one task as TypeScript's
`PiAdapter.spawn` does. `PiHarness::new(bin, settings, kill_grace)`
takes the program (a `String`), a `PiSettings` and a `Duration`, and
`with_preflight(self, ready: &PiReady) -> PiHarness` returns the same
harness carrying the version `preflight_pi` read for that program.

- `agent_env()` SHALL return, in this order, the names TypeScript's
  `HARNESS_AGENT_ENV.pi` lists: `ANTHROPIC_API_KEY`,
  `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_OAUTH_TOKEN`, `OPENAI_API_KEY`,
  `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`,
  `AZURE_OPENAI_RESOURCE_NAME`, `AZURE_OPENAI_API_VERSION`,
  `AZURE_OPENAI_DEPLOYMENT_NAME_MAP`, `DEEPSEEK_API_KEY`,
  `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `XAI_API_KEY`,
  `FIREWORKS_API_KEY`, `TOGETHER_API_KEY`, `OPENROUTER_API_KEY`,
  `AI_GATEWAY_API_KEY`, `ZAI_API_KEY`, `MISTRAL_API_KEY`,
  `MINIMAX_API_KEY`, `MOONSHOT_API_KEY`, `OPENCODE_API_KEY`,
  `KIMI_API_KEY` and `PI_CODING_AGENT_DIR`.
- `harness_version()` SHALL return the `version` of the `PiReady` last
  given to `with_preflight`, and `None` when none was given or that
  version is blank, as TypeScript records `harnessVersion` only when
  its probe read one.
- `start(request, on_event)` SHALL run `run_process_until` with the
  program `bin`, the arguments `pi_args` builds from the settings'
  `provider` and `thinking`, the request's `model` when set, else the
  settings' `model`, and the request's `prompt`, in the request's
  `cwd`, with exactly the request's `env` (ADR 007), the request's
  `timeout` and `kill_grace`.
- Each stdout line SHALL go through `pi_line_events`, with the
  request's `cwd` as the project root and one new `PiStreamState` per
  start, and each event SHALL reach `on_event` in order as it arrives.
  `on_line` returns `true` once the state is settled, so pi is stopped
  `kill_grace` after its `agent_settled` line.
- A program that cannot start SHALL be a `StartError` whose `message`
  is the `ProcessError`'s display, and `on_event` is not called.
- A settled start SHALL be a `HarnessExit` with exit code 0, `timed_out`
  false and no `error`; any other start has the outcome's exit code and
  `timed_out`.
- The `error` of a start that did not settle and exited 0 SHALL be
  absent. For any other start that did not settle it is, in this order:
  when stderr holds `No API key found`, stderr trimmed, `\n` and `Pi
  credentials are missing. Run: pi auth check --provider <provider>`,
  `<provider>` being the settings' provider trimmed, or `default` when
  it is not set or blank; else, when it timed out, `Task execution timed
  out`; else stderr when it is not blank; else absent.

#### Scenario: Pi tasks with a fake pi
- **WHEN** a `PiHarness` whose program is `crates/kernel/harnesses/tests/fixtures/fake-pi/run.sh`, run in place, with the settings provider `deepseek`, model `m-settings` and thinking `high`, and a `kill_grace` of 300 milliseconds starts a request with a new temporary folder as `cwd`, the prompt `Do task 1.`, the model `m-role`, the row's timeout and exactly the variable `FAKE_PI_MODE=<row's mode>`; the fake writes its arguments one per line to `args.txt` in its working directory, then in mode `settle` and `settle-stubborn` prints the four lines below and runs for 10 seconds, leaving on `SIGTERM` with exit code 143 in `settle` and ignoring `SIGTERM` in `settle-stubborn`; in `missing-key` writes `No API key found for deepseek.` to stderr and exits 1; in `fail` writes `boom` to stderr and exits 2; and in `hang` runs for 10 seconds:

```
{"type":"tool_execution_start","toolCallId":"c1","toolName":"write","args":{"path":"notes.md"}}
{"type":"tool_execution_end","toolCallId":"c1","toolName":"write","isError":false}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}
{"type":"agent_settled"}
```

- **THEN** each start returns in under 5 seconds and no sooner than the row's least duration, with the row's exit, events and exit `error`:

| Mode | Timeout | Exit code | Timed out | Events | Exit `error` | Least duration |
|---|---|---|---|---|---|---|
| `settle` | none | 0 | false | `Tool` `write` with summary `notes.md`, `FileChanged` `notes.md`, `Text` `done` | none | 300 ms |
| `settle-stubborn` | none | 0 | false | `Tool` `write` with summary `notes.md`, `FileChanged` `notes.md`, `Text` `done` | none | 600 ms |
| `missing-key` | none | 1 | false | none | `No API key found for deepseek.\nPi credentials are missing. Run: pi auth check --provider deepseek` | none |
| `fail` | none | 2 | false | none | `boom\n` | none |
| `hang` | 300 ms | 124 | true | none | `Task execution timed out` | 300 ms |

#### Scenario: Pi start arguments and defaults
- **WHEN** the `settle` row above runs once with the request's model `m-role`, once with no request model, and the `missing-key` row runs with settings that have no provider
- **THEN** the first `args.txt` holds `pi_args` for provider `deepseek`, model `m-role`, thinking `high` and the prompt `Do task 1.`; the second holds the same with model `m-settings`; and the third start's exit `error` is `No API key found for deepseek.\nPi credentials are missing. Run: pi auth check --provider default`

#### Scenario: Pi harness that cannot start
- **WHEN** a `PiHarness` with the program `/nonexistent/pi` starts a request
- **THEN** it returns a `StartError` whose message starts `cannot start /nonexistent/pi: `, and `on_event` is never called

#### Scenario: Pi agent names
- **WHEN** `agent_env()` is read from a `PiHarness`
- **THEN** it returns the 25 names above in that order

#### Scenario: Real pi run
- **WHEN** the test `crates/kernel/harnesses/tests/real_pi_run.rs`, marked ignored, runs with the variable `OSQ_PI_INTEGRATION` set to `1`, and starts a `PiHarness` with `resolve_pi_binary(None, <the test's environment>)`, the provider from `OSQ_PI_PROVIDER` when set, and a `kill_grace` of 5 seconds, in a new temporary folder, with the prompt `Reply with the word done and nothing else.`, a timeout of 300 seconds, and the environment `role_env` builds for the agent role from the test's environment and the harness's `agent_env()`
- **THEN** the start exits 0 and gives at least one `Text` event; without `OSQ_PI_INTEGRATION` set to `1` the test returns at once and passes

#### Scenario: Pi harness version
- **WHEN** `harness_version()` is read from a `PiHarness` built with `PiHarness::new` and then, per row, given the row's `PiReady` through `with_preflight`
- **THEN** it returns the row's version:

| `PiReady` given | `harness_version()` |
|---|---|
| none | none |
| version `0.87.1`, no warning | `0.87.1` |
| version `pi 9.0.0`, warning `outside` | `pi 9.0.0` |
| version empty, warning `outside` | none |
| version `   `, no warning | none |

### Requirement: Pi harness from config
`PiSettings::from_config(pi: &PiConfig) -> PiSettings` in
`osq-kernel-harnesses` SHALL copy the rust-config `PiConfig`'s
`provider`, `model` and `thinking`. `PiHarness::from_config(config:
&Config, env: &BTreeMap<String, String>) -> PiHarness` SHALL equal
`PiHarness::new` with `resolve_pi_binary(config.pi.bin.as_deref(), env)`,
`PiSettings::from_config(&config.pi)` and
`config.timeouts.harness_kill_grace`. `PiHarness` SHALL derive
`PartialEq` and `Eq` as well as `Debug` and `Clone`.

#### Scenario: Pi harness built from osq.toml
- **WHEN** `PiHarness::from_config` runs with `parse_config` of the row's text and the row's `OSQ_PI_PATH`
- **THEN** it equals `PiHarness::new` with the row's program, settings and kill grace:

| Text | `OSQ_PI_PATH` | Program | Provider | Model | Thinking | Kill grace |
|---|---|---|---|---|---|---|
| empty | not set | `pi` | none | none | none | 5000 ms |
| empty | `/env/pi` | `/env/pi` | none | none | none | 5000 ms |
| `[pi]\nbin = "/opt/pi/bin/pi"\nprovider = "deepseek"\nmodel = "deepseek/deepseek-flash"\nthinking = "high"` | `/env/pi` | `/opt/pi/bin/pi` | `deepseek` | `deepseek/deepseek-flash` | `high` | 5000 ms |
| `[pi]\nmodel = "m1"\n[timeouts]\nharnessKillGracePeriodMs = 300` | not set | `pi` | none | `m1` | none | 300 ms |

### Requirement: Verify command
`run_verify(request: &VerifyRequest) -> Result<VerifyOutcome,
ProcessError>` in `osq-kernel-harnesses` SHALL run `request.command` as
`runVerificationCommand` does: through `/bin/sh -c` in `request.cwd`, in
its own process group, stdin closed. Past `request.timeout` the group gets
`SIGTERM`, then `SIGKILL` after `request.kill_grace`. After the shell
exits, the runner waits at most `kill_grace` for the output pipes to
close. A shell that cannot start is `ProcessError::Spawn`.

#### Scenario: Verify runs of small commands
- **WHEN** `run_verify` runs each row's command in a new temporary folder, given as its canonical path, with the source environment `PATH` set to the test's `PATH`, no configured or agent names, no change, no diff, a `kill_grace` of 300 milliseconds and the row's timeout
- **THEN** the outcome has the row's output, exit code and timed-out flag, and each run returns in under 5 seconds:

| Command | Timeout | Output | Exit code | Timed out |
|---|---|---|---|---|
| `echo out; sleep 0.2; echo err >&2; exit 3` | none | `out\nerr\n` | 3 | false |
| `printf 'a\n\n   \nb'` | none | `a\n\n   \nb` | 0 | false |
| `kill -KILL $$` | none | empty | 1 | false |
| `echo started; sleep 10` | 300 ms | `started\n` | 1 | true |
| `(sleep 10) & echo done` | none | `done\n` | 0 | false |
| `pwd -P; echo "$(pwd -P)/src/a.rs:1"` | none | `.\nsrc/a.rs:1\n` | 0 | false |

#### Scenario: Verify stops the whole group
- **WHEN** `run_verify` runs `sh -c 'sleep 1; echo late > late.txt' & echo started; wait` in a new temporary folder with a timeout of 300 milliseconds and a `kill_grace` of 300 milliseconds, and the test then waits 1.5 seconds
- **THEN** the outcome is timed out with exit code 1 and output `started\n`, and `late.txt` does not exist in the folder

#### Scenario: Verify shell that cannot start
- **WHEN** `run_verify` runs with a `cwd` that does not exist
- **THEN** it returns `ProcessError::Spawn` naming `/bin/sh`

### Requirement: Verify environment
The command SHALL see exactly `role_env(EnvRole::Verify, source_env,
configured_env, agent_env, extra)` with no extra, then `OSQ_CHANGE` set to
`request.change` and `OSQ_DIFF` to `request.diff`, each removed when
`None` even if the source holds it, then every `request.extra_env`
variable set last. So a model key the agent names list never reaches
verify, even when it is configured (ADR 007).

#### Scenario: Verify variables
- **WHEN** `run_verify` runs `printf '%s\n' "${OSQ_CHANGE-unset}" "${OSQ_DIFF-unset}" "${OSQ_MUTANT-unset}" "${DEEPSEEK_API_KEY-unset}" "${ANTHROPIC_API_KEY-unset}" "${CI-unset}"` with the configured names `DEEPSEEK_API_KEY` and `CI`, the agent names `DEEPSEEK_API_KEY` and `ANTHROPIC_API_KEY`, and the row's source, change, diff and extra variables
- **THEN** its output is the row's six lines, each followed by `\n`:

| Source | Change | Diff | Extra | Lines |
|---|---|---|---|---|
| `DEEPSEEK_API_KEY=sk-model`, `ANTHROPIC_API_KEY=sk-ant`, `CI=true` | `/p/openspec/changes/001-a` | `/tmp/d/change.patch` | none | `/p/openspec/changes/001-a`, `/tmp/d/change.patch`, `unset`, `unset`, `unset`, `true` |
| `OSQ_CHANGE=/stale`, `OSQ_DIFF=/stale` | none | none | none | `unset`, `unset`, `unset`, `unset`, `unset`, `unset` |
| none | `/p/c` | none | `OSQ_MUTANT=1`, `OSQ_CHANGE=/x` | `/x`, `unset`, `1`, `unset`, `unset`, `unset` |

### Requirement: Verify outcome
`VerifyOutcome` SHALL hold `exit_code` (an `i32`), `timed_out`, `output`
and `duration`. `output` is stdout and stderr in the order the runner read
them, decoded as `String::from_utf8_lossy` does, then made relative to
`cwd` as `relativizeToolSummary` does: `<cwd>/` is removed and `<cwd>`
followed by the end, whitespace or one of `"'()[]{},;:` becomes `.`. A
timed-out run has exit code 1, and so does a run a signal ended.

#### Scenario: Verify outcome duration
- **WHEN** `run_verify` runs `sleep 0.3` with no timeout
- **THEN** the outcome's `duration` is at least 300 milliseconds and under 5 seconds, and its exit code is 0
