## ADDED Requirements

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

#### Scenario: Preflight with a fake pi
- **WHEN** `crates/kernel/harnesses/tests/fixtures/fake-pi/preflight.sh` is copied into a new temporary folder as `pi` and made executable, and `preflight_pi` runs it in that folder with a `timeout` of 2 seconds, a `kill_grace` of 300 milliseconds, the range `>=0.87.0 <0.88.0`, the row's provider and exactly the row's variables; for `--version` the fake prints `FAKE_PI_VERSION` to stdout and `FAKE_PI_VERSION_STDERR` to stderr, each when not empty, and exits with `FAKE_PI_VERSION_EXIT`, else 0; for `auth` it writes its arguments one per line to `auth-args.txt` in its folder, waits 10 seconds when `FAKE_PI_AUTH_WAIT` is `1`, prints `FAKE_PI_AUTH` when it is not empty, and exits with `FAKE_PI_AUTH_EXIT`, else 0
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

### Requirement: Pi harness
`PiHarness` in `osq-kernel-harnesses` SHALL implement the runners
kernel's `Harness` port for pi, running one task as TypeScript's
`PiAdapter.spawn` does. `PiHarness::new(bin, settings, kill_grace)`
takes the program (a `String`), a `PiSettings` and a `Duration`, and
`last_error()` returns the last start's error as an `Option<&str>`.

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
- A settled start SHALL be a `HarnessExit` with exit code 0 and
  `timed_out` false; any other start has the outcome's exit code and
  `timed_out`.
- Each start SHALL set `last_error()`. It is absent after a settled
  start or one that exited 0. After a start that could not start, it is
  the `StartError`'s message. After any other start it is, in this
  order: when stderr holds `No API key found`, stderr trimmed, `\n` and
  `Pi credentials are missing. Run: pi auth check --provider
  <provider>`, `<provider>` being the settings' provider trimmed, or
  `default` when it is not set or blank; else, when it timed out, `Task
  execution timed out`; else stderr when it is not blank; else absent.

#### Scenario: Pi tasks with a fake pi
- **WHEN** `crates/kernel/harnesses/tests/fixtures/fake-pi/run.sh` is copied into a new temporary folder as `pi` and made executable, and a `PiHarness` with that program, the settings provider `deepseek`, model `m-settings` and thinking `high`, and a `kill_grace` of 300 milliseconds starts a request with that folder as `cwd`, the prompt `Do task 1.`, the model `m-role`, the row's timeout and exactly the variable `FAKE_PI_MODE=<row's mode>`; the fake writes its arguments one per line to `args.txt` in its folder, then in mode `settle` and `settle-stubborn` prints the four lines below and runs for 10 seconds, leaving on `SIGTERM` with exit code 143 in `settle` and ignoring `SIGTERM` in `settle-stubborn`; in `missing-key` writes `No API key found for deepseek.` to stderr and exits 1; in `fail` writes `boom` to stderr and exits 2; and in `hang` runs for 10 seconds:

```
{"type":"tool_execution_start","toolCallId":"c1","toolName":"write","args":{"path":"notes.md"}}
{"type":"tool_execution_end","toolCallId":"c1","toolName":"write","isError":false}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"done"}]}}
{"type":"agent_settled"}
```

- **THEN** each start returns in under 5 seconds and no sooner than the row's least duration, with the row's exit, events and `last_error()`:

| Mode | Timeout | Exit code | Timed out | Events | `last_error()` | Least duration |
|---|---|---|---|---|---|---|
| `settle` | none | 0 | false | `Tool` `write` with summary `notes.md`, `FileChanged` `notes.md`, `Text` `done` | none | 300 ms |
| `settle-stubborn` | none | 0 | false | `Tool` `write` with summary `notes.md`, `FileChanged` `notes.md`, `Text` `done` | none | 600 ms |
| `missing-key` | none | 1 | false | none | `No API key found for deepseek.\nPi credentials are missing. Run: pi auth check --provider deepseek` | none |
| `fail` | none | 2 | false | none | `boom\n` | none |
| `hang` | 300 ms | 124 | true | none | `Task execution timed out` | 300 ms |

#### Scenario: Pi start arguments and defaults
- **WHEN** the `settle` row above runs once with the request's model `m-role`, once with no request model, and the `missing-key` row runs with settings that have no provider
- **THEN** the first `args.txt` holds `pi_args` for provider `deepseek`, model `m-role`, thinking `high` and the prompt `Do task 1.`; the second holds the same with model `m-settings`; and the third start's `last_error()` is `No API key found for deepseek.\nPi credentials are missing. Run: pi auth check --provider default`

#### Scenario: Pi harness that cannot start
- **WHEN** a `PiHarness` with the program `/nonexistent/pi` starts a request
- **THEN** it returns a `StartError` whose message starts `cannot start /nonexistent/pi: `, `on_event` is never called, and `last_error()` is that message

#### Scenario: Pi agent names
- **WHEN** `agent_env()` is read from a `PiHarness`
- **THEN** it returns the 25 names above in that order

#### Scenario: Real pi run
- **WHEN** the test `crates/kernel/harnesses/tests/real_pi_run.rs`, marked ignored, runs with the variable `OSQ_PI_INTEGRATION` set to `1`, and starts a `PiHarness` with `resolve_pi_binary(None, <the test's environment>)`, the provider from `OSQ_PI_PROVIDER` when set, and a `kill_grace` of 5 seconds, in a new temporary folder, with the prompt `Reply with the word done and nothing else.`, a timeout of 300 seconds, and the environment `role_env` builds for the agent role from the test's environment and the harness's `agent_env()`
- **THEN** the start exits 0 and gives at least one `Text` event; without `OSQ_PI_INTEGRATION` set to `1` the test returns at once and passes
