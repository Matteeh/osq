# rust-runners Specification

## Purpose
The runners kernel sits between the loop and the harnesses and owns what every harness shares: the harness and model per role, checking the model exists at startup, timeouts, retries, the usage-limit pause and logging.

## Requirements

### Requirement: Code ownership
<!-- source: crates/kernel/runners/** -->
The rust-runners capability SHALL own the `osq-kernel-runners` crate:
its manifest, its source, its tests and their fixtures.

#### Scenario: Runners crate ownership
- **WHEN** file ownership is resolved for the runners kernel
- **THEN** system maps `crates/kernel/runners/**` to rust-runners

### Requirement: Role environment
`role_env(role, source, configured, agent_env, extra)` in
`osq-kernel-runners` SHALL build the environment of one process osq
starts for `role`, as TypeScript's `buildRoleEnv` does on Unix (ADR 007).
`role` is an `EnvRole`, one of `Prepare`, `Agent` and `Verify`; `source`
and `extra` are `BTreeMap<String, String>`; `configured` is the names
the settings list for that role and `agent_env` the names the harness
reads for its model, both `&[String]`. The result SHALL be a new
`BTreeMap<String, String>` holding only these variables of `source`:

- the names in the exported `BASE_ENV_NAMES`: `PATH`, `HOME`, `USER`,
  `LOGNAME`, `SHELL`, `LANG`, `LANGUAGE`, `LC_ALL`, `LC_CTYPE`, `TERM`,
  `TZ`, `TMPDIR`, `TMP`, `TEMP`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`,
  `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`,
  `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`, `CI`,
  `NO_COLOR`, `SYSTEMROOT`, `COMSPEC`, `PATHEXT`, `WINDIR`,
  `USERPROFILE`, `APPDATA`, `LOCALAPPDATA` and `PROGRAMDATA`
- every variable whose name starts with `OSQ_`
- the `configured` names, except, for `Prepare` and `Verify`, any name
  `agent_env` lists
- for `Agent` only, the `agent_env` names

Then every `extra` variable SHALL be set, winning over `source`. Names
match exactly, with case.

#### Scenario: Role environments
- **WHEN** `role_env` runs for each row's role, source, configured names, agent names and extra variables
- **THEN** it returns exactly the row's variables:

| Role | Source | Configured | Agent names | Extra | Result |
|---|---|---|---|---|---|
| `Verify` | `PATH=/bin`, `HOME=/h`, `OSQ_FAKE_MODE=1`, `AWS_SECRET_ACCESS_KEY=s` | none | none | none | `HOME=/h`, `OSQ_FAKE_MODE=1`, `PATH=/bin` |
| `Verify` | `DATABASE_URL=d` | `DATABASE_URL` | none | none | `DATABASE_URL=d` |
| `Prepare` | `DATABASE_URL=d` | none | none | none | none |
| `Agent` | `ANTHROPIC_API_KEY=a`, `OPENAI_API_KEY=o` | none | `ANTHROPIC_API_KEY` | none | `ANTHROPIC_API_KEY=a` |
| `Verify` | `ANTHROPIC_API_KEY=a` | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | none | none |
| `Prepare` | `ANTHROPIC_API_KEY=a` | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | none | none |
| `Agent` | `ANTHROPIC_API_KEY=a` | `ANTHROPIC_API_KEY` | `ANTHROPIC_API_KEY` | none | `ANTHROPIC_API_KEY=a` |
| `Agent` | `AGENT_PROBE=p`, `SECRET_PROBE=s` | `AGENT_PROBE` | none | none | `AGENT_PROBE=p` |
| `Agent` | `OSQ_TASK_NUMBER=9` | none | none | `OSQ_TASK_NUMBER=1`, `OSQ_SPEC_FOLDER=f` | `OSQ_SPEC_FOLDER=f`, `OSQ_TASK_NUMBER=1` |
| `Verify` | `osq_lower=1`, `XOSQ_A=1`, `Path=/p` | `MISSING` | none | none | none |

#### Scenario: Every base name passes
- **WHEN** `role_env` runs for `Verify` with a source that sets each name in `BASE_ENV_NAMES` to `v` and `UNLISTED` to `v`
- **THEN** the result holds all 32 base names, each `v`, and no `UNLISTED`

### Requirement: Usage limit pause time
`find_usage_limit(events)` in `osq-kernel-runners` SHALL return the data
of the last `Event::UsageLimit` among `events`, a `&[Event]`, or `None`
without one, as TypeScript's `findUsageLimit` does.

`pause_until(limit, now_ms, wait)` SHALL return the time the pause lasts
until and its `PauseSource`, as TypeScript's `pauseUntil` does: when
`limit.resets_at` is a time later than `now_ms`, that time and
`PauseSource::Harness`; otherwise `now_ms` plus `wait`, a `Duration`,
and `PauseSource::Wait`. `now_ms` is epoch milliseconds as an `i64`.
A time is read and written only in the fixed form
`YYYY-MM-DDTHH:MM:SS.mmmZ` in UTC, the form every harness adapter
writes; a `resets_at` in any other form, or naming a month, day, hour,
minute or second that does not exist, counts as no time. `PauseSource`
SHALL give `harness` and `wait` as its `as_str()`.

#### Scenario: Last limit wins
- **WHEN** `find_usage_limit` reads a `Text` event, a `UsageLimit` with `resetsAt` `2026-10-21T13:00:00.000Z`, a `Tool` event and a `UsageLimit` with only `error` `Monthly quota exceeded`, and then reads a list with no `UsageLimit`
- **THEN** the first gives the limit with `error` `Monthly quota exceeded` and no `resetsAt`, and the second gives `None`

#### Scenario: Pause times
- **WHEN** `pause_until` runs for each row's `resets_at`, `now_ms` and a `wait` of 600 seconds
- **THEN** it returns the row's time and source:

| `resets_at` | `now_ms` | Until | Source |
|---|---|---|---|
| `2026-10-21T13:00:00.000Z` | 1792584000000 | `2026-10-21T13:00:00.000Z` | `harness` |
| `2026-10-21T12:00:00.001Z` | 1792584000000 | `2026-10-21T12:00:00.001Z` | `harness` |
| `2026-10-21T12:00:00.000Z` | 1792584000000 | `2026-10-21T12:10:00.000Z` | `wait` |
| `2026-10-21T11:00:00.000Z` | 1792584000000 | `2026-10-21T12:10:00.000Z` | `wait` |
| none | 1792584000000 | `2026-10-21T12:10:00.000Z` | `wait` |
| `not a time` | 1792584000000 | `2026-10-21T12:10:00.000Z` | `wait` |
| `2026-10-21T13:00:00Z` | 1792584000000 | `2026-10-21T12:10:00.000Z` | `wait` |
| `2026-02-30T00:00:00.000Z` | 0 | `1970-01-01T00:10:00.000Z` | `wait` |
| `2026-13-01T00:00:00.000Z` | 0 | `1970-01-01T00:10:00.000Z` | `wait` |
| `2026-10-21T24:00:00.000Z` | 0 | `1970-01-01T00:10:00.000Z` | `wait` |
| `2026-10-21T12:60:00.000Z` | 0 | `1970-01-01T00:10:00.000Z` | `wait` |
| `2026-10-21T12:00:60.000Z` | 0 | `1970-01-01T00:10:00.000Z` | `wait` |
| `2028-02-29T00:00:00.000Z` | 0 | `2028-02-29T00:00:00.000Z` | `harness` |
| none | 1792584000250 | `2026-10-21T12:10:00.250Z` | `wait` |
| none | 1798761300000 | `2027-01-01T00:05:00.000Z` | `wait` |
| none | 1835394900000 | `2028-02-29T00:05:00.000Z` | `wait` |

### Requirement: Harness and model per role
`run_task(settings, request, harnesses, clock, on_event)` in
`osq-kernel-runners` SHALL start one task for `request.role` on the
harness and model `settings` give that role, so its caller never names
a harness. `settings` is a `RunnerSettings`, a typed value its caller
builds, with a `RoleSettings` for each `Role` (`Executor`, `Planner` and
`Validator`) holding `harness` (a `String`), `model` (an
`Option<String>`) and `timeout` (an `Option<Duration>`), plus
`agent_env` (the names settings list for the agent role),
`start_retries` (a `u32`), `retry_delay` and `usage_limit_wait` (each a
`Duration`). The runner reads no configuration file.

`harnesses` is a `&mut BTreeMap<String, Box<dyn Harness>>` by harness
name, and `Harness` is the port every harness adapter implements:

```rust
pub trait Harness {
    fn agent_env(&self) -> Vec<String>;
    fn start(
        &mut self,
        request: &StartRequest,
        on_event: &mut dyn FnMut(Event),
    ) -> Result<HarnessExit, StartError>;
}
```

The runner SHALL pass the role's harness a `StartRequest` with the
role, the harness name, the role's `model` and `timeout`, and the
request's `prompt` and `cwd`, and an `env` that `role_env` builds for
`EnvRole::Agent` from `request.source_env`, `settings.agent_env`, that
harness's `agent_env()` and `request.extra_env`. Every event the harness
gives SHALL reach `on_event` as it arrives, in order. A role whose
harness is not in `harnesses` SHALL be
`RunError::UnknownHarness { role, harness }`, with no harness started
and no event given. A start that ends without a failed start or a usage
limit SHALL be `RunOutcome::Exited` with the harness's `HarnessExit`
(`exit_code` and `timed_out`); judging it is the caller's work.

#### Scenario: Each role gets its harness and model
- **WHEN** settings give the executor `pi` with model `deepseek-flash` and a timeout of 60 seconds, the planner `claude` with model `claude-opus-5-5` and the validator `claude` with no model, and `run_task` runs each role with fake `pi` and `claude` harnesses that exit 0
- **THEN** each run is `Exited` with exit code 0, and the harness of the row gets one start with the row's model and timeout:

| Role | Harness started | Model | Timeout |
|---|---|---|---|
| `Executor` | `pi` | `deepseek-flash` | 60 seconds |
| `Planner` | `claude` | `claude-opus-5-5` | none |
| `Validator` | `claude` | none | none |

#### Scenario: Start request and events
- **WHEN** the executor's fake `pi` reads the agent name `PI_KEY` and gives a `Text` event and then a `Tool` event before exiting 3, and `run_task` runs task `1` with prompt `Do task 1.`, a cwd of `/work/project`, a source of `PATH=/bin`, `PI_KEY=k` and `SECRET_PROBE=s`, settings' agent names `AGENT_PROBE`, and the extra variable `OSQ_TASK_NUMBER=1`
- **THEN** `pi`'s start request holds that prompt and cwd and exactly the environment `OSQ_TASK_NUMBER=1`, `PATH=/bin` and `PI_KEY=k`; `on_event` receives the `Text` and then the `Tool` event; and the outcome is `Exited` with exit code 3

#### Scenario: Unknown harness
- **WHEN** settings give the validator `codex` and `harnesses` holds only `pi` and `claude`
- **THEN** `run_task` for the validator returns `RunError::UnknownHarness` naming `Validator` and `codex`, no fake is started, and `on_event` is never called

### Requirement: Start retries
A start SHALL count as failed when the harness's `start` returns a
`StartError`, or when it exits with a code other than 0 or timed out
while the events it gave during that start hold a `HarnessRetry` with
phase `start` and no later `HarnessRetry` with phase `end` and
`success` `Some(true)`, the harness's own retry the provider never
answered, as TypeScript's provider outage rule decides it. The failure's
error is the `StartError`'s message, or the `error` of the last such
open retry start. A start whose events hold a `UsageLimit` never counts
as failed.

After a failed start, while fewer than `settings.start_retries` retries
were made for this task, the runner SHALL give one `HarnessRetry` event
with phase `start`, `attempt` the 1-based number of this retry,
`max_attempts` `start_retries`, `delay_ms` `retry_delay` in
milliseconds and the failure's error, then call `clock.wait` with
`retry_delay`, then start the same harness again with the same
`StartRequest`. When a retried start does not fail, the runner SHALL
give one `HarnessRetry` event with phase `end`, the same `attempt` and
`max_attempts`, and `success` `Some(true)` before it ends. When retries
run out, the outcome SHALL be `RunOutcome::StartFailed` with `starts`,
the number of starts made, and the last failure's error, and no `end`
event is given, so the open retry reads as a provider outage.

`clock` is a `&mut dyn Clock`, with `now_ms(&self) -> i64` and
`wait(&mut self, duration: Duration)`; `SystemClock` reads the system
time and sleeps.

#### Scenario: Failed starts are retried
- **WHEN** settings give the executor's fake `pi` a `start_retries` of 2 and a `retry_delay` of 300 seconds, and `pi` gives each row's starts in order
- **THEN** `run_task` returns the row's outcome after the row's number of starts and waits of 300 seconds, and the runner's own `HarnessRetry` events are the row's:

| Starts the fake gives | Outcome | Starts | Waits | Runner events |
|---|---|---|---|---|
| exit 0 | `Exited` 0 | 1 | 0 | none |
| exit 1 | `Exited` 1 | 1 | 0 | none |
| open retry `503`, exit 0 | `Exited` 0 | 1 | 0 | none |
| retry `503` ended with success, exit 1 | `Exited` 1 | 1 | 0 | none |
| start error `cannot start pi`; exit 0 | `Exited` 0 | 2 | 1 | start 1 of 2 `cannot start pi`; end 1 of 2 success |
| open retry `503`, exit 1; open retry `503`, timed out with exit 124; exit 0 | `Exited` 0 | 3 | 2 | start 1 of 2 `503`; start 2 of 2 `503`; end 2 of 2 success |
| open retry `503`, exit 1; open retry `503`, exit 1; open retry `529`, exit 1 | `StartFailed` after 3 starts, error `529` | 3 | 2 | start 1 of 2 `503`; start 2 of 2 `503` |

Each runner `start` event has `delay_ms` 300000 and no `success`; each `end` event has no `delay_ms` and no `error`.

#### Scenario: No retries configured
- **WHEN** `start_retries` is 0 and the fake's start returns the error `cannot start pi`
- **THEN** `run_task` returns `StartFailed` after 1 start with error `cannot start pi`, the clock never waits, and no `HarnessRetry` event is given

#### Scenario: System clock
- **WHEN** `SystemClock` reads the time between two reads of the system time and waits 20 milliseconds
- **THEN** its time lies between the two reads, and at least 20 milliseconds pass during the wait

### Requirement: Usage limit pause
When the events a harness gave during one start hold an
`Event::UsageLimit`, the runner SHALL pause instead of retrying or
judging the start, whatever its exit code, as TypeScript's usage limit
pause does: it SHALL compute `pause_until` for `find_usage_limit` of
those events, `clock.now_ms()` and `settings.usage_limit_wait`, give one
`Event::Paused` with `task` `request.task`, that `until`, the source's
`as_str()`, and the limit's `error` when it has one, and return
`RunOutcome::Paused` with a `UsagePause` holding the same `task`,
`until`, `source` and `error`. Writing `.run/paused.md` and waiting out
the pause are the caller's work.

#### Scenario: Usage limits pause the task
- **WHEN** settings give a `usage_limit_wait` of 600 seconds and a `start_retries` of 2, the clock reads 1792584000000, and the executor's fake `pi`, running task `1`, gives each row's events and exit
- **THEN** `run_task` returns `Paused` with task `1` and the row's until, source and error after one start, `on_event` receives one `Paused` event with the same values after the fake's events, and no `HarnessRetry` event comes from the runner:

| Fake's events | Exit | Until | Source | Error |
|---|---|---|---|---|
| `UsageLimit` with `resetsAt` `2026-10-21T13:00:00.000Z` | 1 | `2026-10-21T13:00:00.000Z` | `harness` | none |
| open retry `503`, then `UsageLimit` with `error` `Monthly quota exceeded` | 1 | `2026-10-21T12:10:00.000Z` | `wait` | `Monthly quota exceeded` |
| `UsageLimit` with no fields | 0 | `2026-10-21T12:10:00.000Z` | `wait` | none |
