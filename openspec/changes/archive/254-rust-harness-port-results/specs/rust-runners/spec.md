## MODIFIED Requirements

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
    fn harness_version(&self) -> Option<String>;
    fn start(
        &mut self,
        request: &StartRequest,
        on_event: &mut dyn FnMut(Event),
    ) -> Result<HarnessExit, StartError>;
}
```

`harness_version()` SHALL return the version of the harness program the
adapter starts, for the `harness_version` of the `started` record its
caller writes, and `None` when the adapter has none; the runner itself
never reads it.

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
unchanged: `exit_code`, `timed_out` and `error`, the start's error text
as an `Option<String>`, absent when the harness reported none; judging
it is the caller's work.

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

#### Scenario: Exit error and harness version
- **WHEN** settings give the executor `pi` with `start_retries` 0, and `run_task` runs the executor once per row with a fake `pi` whose one start exits as the row says and whose `harness_version()` is the row's version, and the test reads `harness_version()` from that fake through the `harnesses` map after the run
- **THEN** each outcome is `Exited` with the row's exit code, `timed_out` false and error, and the version read is the row's:

| Fake exit | Fake version | Outcome error | Version read |
|---|---|---|---|
| exit 0, no error | `0.87.1` | none | `0.87.1` |
| exit 1, error `boom` | none | `boom` | none |
