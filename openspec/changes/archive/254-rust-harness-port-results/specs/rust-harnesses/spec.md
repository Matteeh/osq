## MODIFIED Requirements

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
- **WHEN** `crates/kernel/harnesses/tests/fixtures/fake-pi/run.sh` is copied into a new temporary folder as `pi` and made executable, and a `PiHarness` with that program, the settings provider `deepseek`, model `m-settings` and thinking `high`, and a `kill_grace` of 300 milliseconds starts a request with that folder as `cwd`, the prompt `Do task 1.`, the model `m-role`, the row's timeout and exactly the variable `FAKE_PI_MODE=<row's mode>`; the fake writes its arguments one per line to `args.txt` in its folder, then in mode `settle` and `settle-stubborn` prints the four lines below and runs for 10 seconds, leaving on `SIGTERM` with exit code 143 in `settle` and ignoring `SIGTERM` in `settle-stubborn`; in `missing-key` writes `No API key found for deepseek.` to stderr and exits 1; in `fail` writes `boom` to stderr and exits 2; and in `hang` runs for 10 seconds:

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
