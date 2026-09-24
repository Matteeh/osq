# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Claude task execution
<!-- source: src/harness/claude/claude-exec.ts, src/harness/claude/claude-exec-args.ts, src/harness/index.ts, tests/claude/** -->
The Claude adapter SHALL implement the existing `HarnessAdapter` port without
new methods and SHALL run each task as a fresh `claude -p` process in the
project root with stdin closed, no session resume, and
`--output-format stream-json --verbose`. The prompt SHALL be the one
`buildExecutorPrompt` returns, passed as one literal argument after `--`. Setup
SHALL write no Claude Code files.

#### Scenario: Fresh headless process
- **WHEN** a task spawns with harness `claude`
- **THEN** Claude Code runs in the project root with stdin closed, receives `-p --output-format stream-json --verbose` and `--no-session-persistence`, and receives the shared executor prompt byte for byte after `--`

#### Scenario: Configured model
- **WHEN** `claude.model` is set
- **THEN** Claude Code receives `--model` with that value, and without it no `--model` flag is passed and execution metadata records `default`

### Requirement: Claude tool surface
<!-- source: src/harness/claude/claude-exec-args.ts, tests/claude/** -->
Every Claude task SHALL load only the built-in tools `Bash`, `Read`, `Edit`,
`Write`, `Glob`, and `Grep` through `--tools`, no MCP servers through
`--strict-mcp-config` without `--mcp-config`, no skills through
`--disable-slash-commands`, no user, project, or local settings files through
`--setting-sources ""`, and no auto-memory through `--settings` carrying
`"autoMemoryEnabled": false`. A non-empty `ANTHROPIC_API_KEY` SHALL add
`--bare`. No configuration SHALL re-enable any of them.

#### Scenario: Login run
- **WHEN** `ANTHROPIC_API_KEY` is unset or empty
- **THEN** the arguments carry every stripping flag above and no `--bare`

#### Scenario: API key run
- **WHEN** `ANTHROPIC_API_KEY` is non-empty
- **THEN** the arguments also carry `--bare`

### Requirement: Claude permissions and containment
<!-- source: src/harness/claude/claude-exec-args.ts, src/core/foundation/config-claude.ts, tests/claude/** -->
Every Claude task SHALL run with `--permission-mode dontAsk`, the allow rules
`Bash`, `Read`, `Edit(./**)`, `Write(./**)`, `Glob`, and `Grep`, and the deny
rule `Bash(git:*)`. When `claude.sandbox` is true, the `--settings` JSON SHALL
also carry `sandbox` with `enabled: true`, `failIfUnavailable: true`,
`autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, and
`network` with an empty `allowedDomains` and `strictAllowlist: true`.

#### Scenario: Default containment
- **WHEN** `claude.sandbox` is unset or false
- **THEN** the settings JSON is exactly `{"autoMemoryEnabled":false}` and the `git` deny rule is passed

#### Scenario: Sandboxed containment
- **WHEN** `claude.sandbox` is true
- **THEN** the settings JSON carries the sandbox block above, and the `git` deny rule is still passed

### Requirement: Claude stream translation
<!-- source: src/harness/claude/claude-stream.ts, src/harness/claude/claude-tools.ts, tests/claude/**, tests/fixtures/claude/** -->
The adapter SHALL read stdout through the shared LF-only `EventStreamParser`
and skip malformed or unknown records without aborting. Each `tool_use` block
in an `assistant` record SHALL become a `tool` event with a project-relative
summary, and each non-empty `text` block a `text` event. Each `tool_result`
without `is_error: true` for a remembered `Edit` or `Write` SHALL become a
`file_changed` event with the project-relative path.

#### Scenario: Captured run
- **WHEN** `tests/fixtures/claude/run.jsonl` is replayed
- **THEN** it yields one `tool` event per `tool_use` block, one `text` event per non-empty `text` block, and a `file_changed` event for each successful `Write` and `Edit`

#### Scenario: Denied command
- **WHEN** a `Bash` `tool_use` is followed by a `tool_result` with `is_error: true`
- **THEN** the `tool` event is still written and no `file_changed` event is written for it

### Requirement: Claude token accounting
<!-- source: src/harness/claude/claude-stream.ts, tests/claude/**, tests/fixtures/claude/** -->
The `result` record SHALL become one `tokens` event per `modelUsage` entry,
with `inputTokens` plus `cacheReadInputTokens` plus `cacheCreationInputTokens`
as `promptTokens`, `outputTokens` as `candidateTokens`, their sum as
`totalTokens`, `cacheReadInputTokens` as `cachedTokens`, `thinkingTokens` as
`reasoningTokens`, `costUSD` as `cost`, and the entry's key as `model`.
Per-message usage SHALL NOT produce `tokens` events.

#### Scenario: Cost matches the run
- **WHEN** a `result` record has two `modelUsage` entries
- **THEN** two `tokens` events are written and their `cost` values sum to the record's `total_cost_usd`

### Requirement: Claude failure and result handling
<!-- source: src/harness/claude/claude-exec.ts, src/watcher/spawn.ts, src/watcher/verify.ts, tests/claude/** -->
A non-zero Claude Code exit SHALL become the existing crashed dead letter
carrying Claude Code's stderr and, when the stream ended with a `result` whose
`is_error` is true, its `subtype`. A missing result file SHALL follow the
watcher's existing synthesis from the last `text` event and its `no_result`
path.

#### Scenario: Sandbox unavailable
- **WHEN** Claude Code prints `sandbox required but unavailable` to stderr and exits 1
- **THEN** the task's dead letter records `crashed` with that stderr

#### Scenario: Successful run without a result file
- **WHEN** the replayed run exits 0 without writing the result file
- **THEN** the watcher synthesizes it from the last `text` event and marks the task done only after its own verify passes

### Requirement: Claude execution attribution
<!-- source: src/harness/types.ts, src/harness/claude/claude-exec.ts, src/watcher/spawn.ts, tests/claude/** -->
`SpawnDetails` SHALL accept an optional `harnessAuth` of `api_key` or `login`,
and the runner SHALL add a supplied value to the `started` event. The Claude
adapter SHALL supply `api_key` when it passed `--bare` and `login` otherwise,
along with `harnessVersion` from the first line of `claude --version`.

#### Scenario: Claude started event
- **WHEN** a Claude task starts without `ANTHROPIC_API_KEY`
- **THEN** its `started` event carries `harness: "claude"`, the configured model or `default`, `harnessVersion`, and `harnessAuth: "login"`

#### Scenario: Other harnesses unchanged
- **WHEN** an adapter supplies no `harnessAuth`
- **THEN** its `started` event carries no `harnessAuth`
