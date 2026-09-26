## MODIFIED Requirements

### Requirement: Interactive harness adapter spawning
<!-- source: src/harness/types.ts, src/harness/opencode/opencode.ts, src/harness/agy/agy.ts, src/harness/mock.ts, tests/harness-interactive.test.ts -->
Harness adapters SHALL implement `spawnInteractive` inheriting terminal stdio and returning the process exit code.

#### Scenario: Opencode interactive session spawning
- **WHEN** `OpencodeAdapter.spawnInteractive` executes
- **THEN** adapter executes `opencode mini --prompt <prompt>` in the working directory with inherited stdio, adding `--model` and `--agent` when given, and no variant, which `mini` does not accept

#### Scenario: Agy interactive session spawning
- **WHEN** `AgyAdapter.spawnInteractive` executes
- **THEN** adapter executes binary with inherited stdio, passing prompt via `-i`, and optional model and agent flags

## ADDED Requirements

### Requirement: OpenCode v2 task execution
<!-- source: src/harness/opencode/opencode.ts, src/harness/opencode/opencode-session.ts, tests/opencode-spawn.test.ts, tests/opencode-v2.test.ts, tests/fixtures/events/opencode-v2/** -->
The opencode adapter SHALL run a task as `opencode run <prompt> --standalone
--agent <agent> --auto --format json --model <model>` with the project root as
the working directory, then one `--file` per attached file as before. It SHALL
pass no `--dir` and no `--variant`; a configured `opencode.variant` SHALL be
appended to the model as `<model>#<variant>`. After the process exits, when
the stream carried a `sessionID`, the adapter SHALL run `opencode session
export --standalone <sessionID>` and, when `info.tokens` and `info.cost`
exceed what the run's `tokens` events recorded, append one `tokens` event with
the difference, so a task's tokens and cost equal the session's totals. A
failed or unparseable export SHALL append nothing. Preflight SHALL exit 1 with
the "OpenCode diagnostics" failure message when the installed opencode is
below 2.0.0.

#### Scenario: Task argv
- **WHEN** `buildOpencodeArgs` runs with `opencode: { model: 'deepseek/deepseek-flash', variant: 'thinking' }`
- **THEN** the argv holds `--standalone`, `--model deepseek/deepseek-flash#thinking`, and neither `--dir` nor `--variant`

#### Scenario: Final step usage
- **WHEN** a fake opencode replays `observed/run-stream.jsonl` and exports `observed/session-export.json`
- **THEN** the task's events hold one `tool` event with tool `read` and summary `hello.txt`, one `text` event `banana`, and two `tokens` events whose prompt tokens sum to 9463 and whose cost sums to the export's `info.cost` within 1e-12

#### Scenario: Export fails
- **WHEN** the fake opencode's `session export` exits 1
- **THEN** the task's events hold only the streamed `tokens` event

#### Scenario: Opencode 1 preflight
- **WHEN** the watcher's preflight runs with an opencode that prints `1.14.3`
- **THEN** it prints the unsupported-version message and exits 1
