# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Pi task execution
<!-- source: src/harness/pi/**, src/harness/index.ts, tests/pi/** -->
The Pi adapter SHALL implement the existing `HarnessAdapter` port without new
methods and SHALL run each task as a fresh process in the project root with
stdin closed. Its arguments SHALL be `--mode json --no-session --no-approve
--offline --no-extensions --no-skills --no-prompt-templates`, then `--provider`,
`--model`, and `--thinking` when each is configured, then `--` and the prompt
`buildExecutorPrompt` returns as one literal argument. Setup SHALL write no Pi
files.

#### Scenario: Configured arguments
- **WHEN** a task spawns with `pi.provider`, `pi.model`, and `pi.thinking` set
- **THEN** Pi receives exactly those arguments in that order, runs in the project root with stdin closed, and receives the shared executor prompt byte for byte

#### Scenario: Native model
- **WHEN** no provider, model, or thinking level applies
- **THEN** those flags are omitted and execution metadata records `default`

### Requirement: Pi preflight
<!-- source: src/harness/pi/**, src/core/foundation/config-pi.ts, tests/pi/** -->
Pi preflight SHALL probe `--version` under `timeouts.harnessPreflightSeconds`
and warn when the version is outside the tested range. When `pi.provider` is
set, it SHALL fail before any task spawns unless `pi auth check --provider
<name> --json` reports `ready`, printing the provider and reason.

#### Scenario: Credentials not ready
- **WHEN** `pi.provider` is set and `pi auth check` reports `not_ready`
- **THEN** preflight fails naming the provider and reason, and no task spawns

#### Scenario: No provider
- **WHEN** `pi.provider` is not set
- **THEN** preflight runs no auth check

### Requirement: Pi stream reading
<!-- source: src/harness/pi/**, src/harness/stream.ts, tests/pi/** -->
The adapter SHALL read stdout continuously through the shared LF-only
`EventStreamParser`, tolerate a trailing carriage return, and skip malformed or
unknown records without aborting. The run SHALL end at `agent_settled` or
process exit, whichever comes first.

#### Scenario: Line separator inside a string
- **WHEN** a record contains U+2028 inside a JSON string
- **THEN** it parses as one record and its observation is recorded

#### Scenario: Retry before settling
- **WHEN** `agent_end` is followed by `auto_retry_start`, more turns, and `agent_settled`
- **THEN** the observations after the retry are still recorded

### Requirement: Pi event translation
<!-- source: src/harness/pi/**, tests/pi/**, tests/fixtures/pi/** -->
Each `tool_execution_start` SHALL become a `tool` event with a project-relative
summary. Each assistant `message_end` SHALL become a `text` event for its
non-empty text and one `tokens` event with `input` as `promptTokens`, `output`
as `candidateTokens`, `cacheRead` as `cachedTokens`, `reasoning` as
`reasoningTokens`, `totalTokens`, `cost.total` as `cost`, and the message's
`provider` and `model`. Each successful `edit` or `write` SHALL become a
`file_changed` event.

#### Scenario: Several responses
- **WHEN** one run contains three assistant `message_end` records with usage
- **THEN** three `tokens` events are written and the report's token and cost totals equal their sums

#### Scenario: Captured run
- **WHEN** `tests/fixtures/pi/run.jsonl` is replayed
- **THEN** it yields one `tool` event per `tool_execution_start` and one `tokens` event per assistant `message_end`

### Requirement: Harness retry events
<!-- source: src/harness/types.ts, src/harness/pi/**, tests/pi/** -->
Each Pi `auto_retry_start` and `auto_retry_end` SHALL become a `harness_retry`
event carrying `phase` (`start` or `end`) and `attempt`, plus `maxAttempts`,
`delayMs`, `success`, and `error` when Pi reports them.

#### Scenario: One retry
- **WHEN** a run contains one `auto_retry_start` and one `auto_retry_end`
- **THEN** two `harness_retry` events are written, with phases `start` and `end`

### Requirement: Pi failure and result handling
<!-- source: src/harness/pi/**, src/watcher/spawn.ts, src/watcher/verify.ts, tests/pi/** -->
A non-zero Pi exit SHALL become the existing crashed dead letter carrying Pi's
stderr; when stderr says no API key was found, the message SHALL also name
`pi auth check --provider <name>`. When Pi writes `agent_settled` but does not
exit within `timeouts.harnessKillGracePeriodMs`, the adapter SHALL stop it and
report success. A missing result file SHALL follow the watcher's existing
synthesis and `no_result` path.

#### Scenario: Missing credentials
- **WHEN** Pi prints the session header, writes `No API key found for the selected model.` to stderr, and exits 1
- **THEN** the task's dead letter records `crashed` with that stderr and names `pi auth check`

#### Scenario: Lingering after settling
- **WHEN** Pi writes `agent_settled` and keeps running
- **THEN** the adapter stops it after the kill grace and the watcher goes on to verification

### Requirement: Pi execution attribution
<!-- source: src/harness/types.ts, src/harness/pi/**, src/watcher/spawn.ts, tests/pi/** -->
`SpawnTaskOptions.onSpawn` SHALL accept optional spawn details, and the runner
SHALL add a supplied `harnessVersion` to the `started` event. The Pi adapter
SHALL supply the first line of `pi --version`. `started.model` and the approval
manifest SHALL record `pi.model`, the `OSQ_MODEL` fallback, or `default`, and
the manifest SHALL record `pi.thinking` as effort, or null.

#### Scenario: Pi started event
- **WHEN** a Pi task starts
- **THEN** its `started` event carries `harness: "pi"`, the configured model or `default`, and `harnessVersion`

#### Scenario: Other harnesses unchanged
- **WHEN** an adapter calls `onSpawn` with a PID only
- **THEN** its `started` event is unchanged and carries no `harnessVersion`
