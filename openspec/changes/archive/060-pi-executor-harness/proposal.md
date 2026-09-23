---
title: Pi executor harness
depends_on: []
verify: pnpm verify
features:
  reads:
    - watcher-and-harness
    - cli-foundation
---
## Goal

osq can run executor tasks with Pi (https://pi.dev) in JSON mode. Pi tasks are
spawned, recorded, verified, and reported like tasks on every other harness,
and `osq doctor` tells the user before a run whether Pi is installed, inside
the tested version range, and authenticated.

Pi is a small multi-provider agent with a minimal system prompt, which fits
osq's model of a fresh, cheap agent per task. It gives users a second route to
cheap models besides OpenCode.

Facts this change relies on, checked against Pi 0.87.0 on this machine, a
captured DeepSeek run, and the docs at https://pi.dev/docs/latest:

- The package is `@earendil-works/pi-coding-agent`; the binary is `pi`.
- `pi --mode json -- "<prompt>"` runs once, writes JSONL events to stdout, and
  exits. With stdin left open Pi waits forever, so stdin stays closed.
  `src/harness/process.ts` already defaults stdin to `ignore`.
- Records split on LF only. A string inside a record may contain U+2028 or
  U+2029, so Node's `readline` must not be used. The shared
  `EventStreamParser` already splits on `\n` only.
- The stream is a `session` header, then `agent_start`, `turn_start`,
  `message_start`, `message_update`, `message_end`, `tool_execution_start`,
  `tool_execution_update`, `tool_execution_end`, `turn_end`, `agent_end`, and
  finally `agent_settled`. `agent_end` can be followed by an automatic retry
  (`auto_retry_start` carrying `attempt`, `maxAttempts`, `delayMs`,
  `errorMessage`; `auto_retry_end` carrying `success`, `attempt`, and
  optionally `finalError`) or compaction. Only `agent_settled` means Pi has no
  work left.
- `message_end` fires for system, user, toolResult, and assistant messages.
  An assistant `message_end` carries `message.provider`, `message.model`,
  `message.content` (text, thinking, and tool-call parts), and `message.usage`
  with `input`, `output`, `cacheRead`, `cacheWrite`, `reasoning`,
  `totalTokens`, and `cost.total`.
- Only the `session` header carries a `timestamp`.
- `tool_execution_start` carries `toolCallId`, `toolName`, and `args`;
  `tool_execution_end` carries `toolCallId`, `toolName`, `result`, and
  `isError`.
- With no credentials, Pi prints the session header, writes
  `No API key found for the selected model.` to stderr, and exits 1.
- `pi auth check --provider <name> --json` prints
  `{"status":"...","provider":"...","reason":"..."}` with status `ready`,
  `not_ready`, or `invalid`, and exits 0, 1, or 2.
- Pi loads only the first of `AGENTS.override.md`, `AGENTS.md`, `CLAUDE.md` in
  each directory. This repository's `CLAUDE.md` is a symlink to `AGENTS.md`, so
  the executor protocol reaches Pi once, not twice. A consumer's
  `AGENTS.override.md` would shadow `AGENTS.md`; the README says so.

The tested Pi range is `>=0.87.0 <0.88.0`, one constant in
`src/core/foundation/config-pi.ts`. Pi releases every few days, so bumping it
is a one-line change. Doctor and preflight warn outside the range; they do not
fail.

The executor prompt is already shared: `buildExecutorPrompt` in
`src/harness/prompt.ts` (change 050). Pi uses it unchanged.

Pi's stream reports the provider and model it resolved only after the process
is running, but the runner writes `started` the moment the process exists. So
`started` records Pi's version from `pi --version`, and each `tokens` event
records the provider and model Pi reported for that response. `started.model`
stays the configured executor model, so it keeps agreeing with the approval
manifest.

## Verify

`pnpm verify`

The typechecks, build, full suite, and lint pass. New offline tests under
`tests/pi/` drive a fake `pi` executable that replays fixtures. They prove that
the captured fixture translates into the expected osq events, that a record
containing U+2028 parses as one record, that tokens and cost sum across several
responses, that a retry before `agent_settled` does not end the run, that the
missing-credentials exit produces a crashed dead letter naming `pi auth check`,
that the spawned process has stdin closed, and that doctor fails on a
`not_ready` auth check and warns on a version outside the tested range. No test
needs a network, a TTY, credentials, or a real model.

## Non-goals

- Pi's RPC and SDK modes.
- Planning through Pi. The Pi adapter has no `spawnInteractive`, so
  `osq plan --session` with a Pi planner stops with the existing "does not
  support interactive sessions" error.
- Loading or shipping Pi extensions, skills, or prompt templates. There is no
  config key to re-enable them.
- Sandboxing Pi or persisting its sessions.
- Marking Pi's containment in the harness catalog. The catalog records no
  containment yet.
- Editing `AGENTS.md` or `CLAUDE.md`.
- A Pi extension that refuses out-of-scope writes. That is a later change.

## Surface

- Added: `pi` (harness)
- Added: `pi.bin`, `pi.provider`, `pi.model`, `pi.thinking` (config keys)
- Added: `OSQ_PI_PATH` (environment variable for the Pi binary path)
- Added: `harness_retry` (event type)
- Added: `started.harnessVersion` (event field)
- Added: `tokens.provider`, `tokens.model` (event fields)
- Added: `harness-version`, `harness-auth` (doctor checks, Pi only)

## Contract

### Requirement: Pi task execution
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
Each Pi `auto_retry_start` and `auto_retry_end` SHALL become a `harness_retry`
event carrying `phase` (`start` or `end`) and `attempt`, plus `maxAttempts`,
`delayMs`, `success`, and `error` when Pi reports them.

#### Scenario: One retry
- **WHEN** a run contains one `auto_retry_start` and one `auto_retry_end`
- **THEN** two `harness_retry` events are written, with phases `start` and `end`

### Requirement: Pi failure and result handling
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

### Requirement: Pi configuration and resolution
Configuration SHALL accept harness `pi` and a publicly exported `PiConfig` with
optional non-empty `bin`, `provider`, `model`, and `thinking` strings, and SHALL
reject blank or non-string values naming the key. The binary SHALL resolve from
`pi.bin`, then `OSQ_PI_PATH`, then `pi`. The model SHALL resolve from
`pi.model`, then `OSQ_MODEL` only when Pi is the executor, then Pi's native
default. Effort SHALL be `pi.thinking` or null. The catalog entry SHALL declare
`planner.agent` unsupported.

#### Scenario: Explicit settings win
- **WHEN** `pi.bin` and `pi.model` are set and `OSQ_PI_PATH` and `OSQ_MODEL` are also set
- **THEN** osq uses `pi.bin` and `pi.model`

#### Scenario: Blank setting
- **WHEN** `pi.provider` is an empty string
- **THEN** configuration fails with a message naming `pi.provider`

### Requirement: Pi diagnostics
A catalog entry MAY declare an optional `diagnose` hook, and doctor SHALL run
it after a passing `harness` check without naming any harness. For Pi it SHALL
add a `harness-version` check that warns, without failing, outside
`>=0.87.0 <0.88.0`, and, when `pi.provider` is set, a `harness-auth` check that
runs `pi auth check --provider <name> --json` and fails unless the status is
`ready`, printing the provider and reason.

#### Scenario: Not ready
- **WHEN** doctor runs with `pi.provider: 'deepseek'` and the auth check prints `not_ready` with reason `credentials_not_configured`
- **THEN** the `harness-auth` check fails naming `deepseek` and `credentials_not_configured`

#### Scenario: Untested version
- **WHEN** `pi --version` prints `0.88.0`
- **THEN** the `harness-version` check passes with a warning naming `0.88.0` and the tested range

#### Scenario: No provider
- **WHEN** `pi.provider` is not set
- **THEN** doctor runs no auth check

### Requirement: Pi consumer guidance
The README SHALL describe the Pi harness: its settings and their precedence,
installation, the tested version range, credentials and `pi auth check`, that
setup writes no Pi files because Pi reads `AGENTS.md`, the flags osq passes,
that Pi has no sandbox or permission prompts, and that Pi cannot plan.

#### Scenario: Reading the Pi section
- **WHEN** a consumer reads the README's Pi section
- **THEN** it finds a config example with placeholder provider and model, and an honest statement that task scope is a protocol, not confinement

## Human steps

- Install Pi 0.87.x with `npm install -g @earendil-works/pi-coding-agent` and
  configure one provider. `pi auth check --provider <name>` should report
  `ready`.
- Before `osq approve`, capture the golden fixture in a throwaway repository:
  `pi --mode json --no-session --no-approve --offline --provider <p> --model <m> -- "Create hello.txt containing hi, then run cat hello.txt" < /dev/null > pi-run.jsonl`.
  Strip prompt and file content, keep every event type, and commit it as
  `tests/fixtures/pi/run.jsonl`. Task 1's tests read it and fail without it.
- Review the proposal, delta specs, and task bodies, then run `osq approve 060`
  yourself.

## Delta

- `specs/watcher-and-harness/spec.md` adds `Pi task execution`, `Pi
  preflight`, `Pi stream reading`, `Pi event translation`, `Harness retry
  events`, `Pi failure and result handling`, and `Pi execution attribution`.
- `specs/cli-foundation/spec.md` adds `Pi configuration and resolution`, `Pi
  diagnostics`, and `Pi consumer guidance`.

No file is shared between tasks. Task 1 adds the catalog's `diagnose` hook and
Pi's implementation of it; task 2 calls it from `doctor.ts`.
