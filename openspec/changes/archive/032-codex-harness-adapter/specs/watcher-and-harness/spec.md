# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Codex task execution
<!-- source: src/harness/codex*.ts, src/harness/index.ts, src/watcher/loop.ts, tests/codex/** -->
The Codex adapter SHALL implement the existing HarnessAdapter port without new methods and SHALL run each task in a fresh noninteractive process in the project root. It SHALL use literal argv, exec JSONL output, workspace-write sandboxing, approval policy never, disabled web search and workspace shell network access, and optional model/effort overrides. It SHALL retain native authentication/config loading without modifying it or bypassing enforced policies.

#### Scenario: Executor prompt
- **WHEN** an approved task is spawned
- **THEN** Codex receives task/proposal/delta/living capability paths, prior-result guidance, scope, entry files, verification command, result destination, capability rules, and the one-attempt execution procedure

#### Scenario: Process controls
- **WHEN** the adapter starts a task
- **THEN** it reuses shared process execution with configured task timeout and kill grace, preserves PID/signal/elapsed diagnostics, uses a literal prompt argument, and does not use shell interpolation, full-auto, permission bypass flags, or session resume

#### Scenario: Watcher preflight
- **WHEN** the watcher starts with Codex
- **THEN** it invokes the adapter's existing preflight port to probe the resolved binary with --version under the configured preflight deadline, and a failed probe prevents task-agent spawn

### Requirement: Codex stream observations
<!-- source: src/harness/codex*.ts, src/harness/stream.ts, tests/codex/** -->
The adapter SHALL use shared ordered JSONL buffering to translate completed Codex observations into existing osq events, without emitting watcher lifecycle or verification events.

#### Scenario: Completed item translation
- **WHEN** item.completed supplies a non-empty assistant message, command/MCP observation, or successful file change
- **THEN** the adapter emits text, tool, or file_changed respectively, uses project-relative paths, excludes reasoning text from results, and does not count file changes again as edit/write tool events

#### Scenario: Usage translation
- **WHEN** turn.completed contains usage
- **THEN** input_tokens becomes promptTokens, output_tokens becomes candidateTokens, cached_input_tokens becomes cachedTokens, and reported reasoning_output_tokens becomes reasoningTokens; totalTokens is input plus output, and absent optional counters and cost are omitted

#### Scenario: Chunked and unfamiliar output
- **WHEN** stdout contains fragmented records, an unterminated final record, malformed JSON, unknown events, or item lifecycle updates
- **THEN** valid observations remain ordered, the parser flushes before spawn returns, malformed/unknown records do not abort parsing, and only completed stages emit completed observations

### Requirement: Codex failure and result handling
<!-- source: src/harness/codex*.ts, src/watcher/spawn.ts, src/watcher/verify.ts, tests/codex/** -->
The adapter SHALL return terminal Codex failures to the existing watcher lifecycle. The watcher SHALL own results, markers, checkboxes, and independent verification.

#### Scenario: Terminal turn failure
- **WHEN** Codex reports turn.failed even if its process exits zero
- **THEN** spawn returns a failed outcome carrying diagnostic text and the watcher records crashed

#### Scenario: Process failure and recovery
- **WHEN** Codex exits unsuccessfully or times out
- **THEN** the watcher records crashed or timeout through existing outcomes; a recoverable error event followed by a successful turn does not alone cause terminal failure

#### Scenario: Result fallback
- **WHEN** Codex exits successfully without a result file
- **THEN** the watcher synthesizes a result from the last completed non-empty assistant text, or records no_result when no such text exists

#### Scenario: Independent verification
- **WHEN** a successful Codex process supplies a result or final text
- **THEN** the watcher writes done only after its own verification passes and records verify_red when verification fails

### Requirement: Codex execution attribution
<!-- source: src/core/manifest.ts, src/core/config*.ts, src/watcher/spawn.ts, tests/codex/** -->
Execution manifests and started events SHALL record the selected Codex model without another harness's fallback. Native model selection SHALL be represented as default rather than a guessed model. The manifest SHALL record configured Codex effort or null while preserving explicit planner.model-or-null semantics.

#### Scenario: Explicit settings
- **WHEN** Codex execution has a selected model and effort
- **THEN** process arguments, started metadata, and execution manifest agree on the model and the manifest records that effort

#### Scenario: Native model
- **WHEN** no Codex model override applies
- **THEN** the CLI model flag is omitted and execution metadata records default without an agy or OpenCode model

### Requirement: Codex interactive sessions
<!-- source: src/harness/codex*.ts, src/cli/plan.ts, tests/codex/** -->
The adapter SHALL implement the existing spawnInteractive port using Codex's interactive CLI with inherited stdio, project cwd, the supplied opening prompt, optional selected model, workspace-write sandboxing, and on-request approvals. It SHALL use native planner effort defaults and reject unsupported agent arguments.

#### Scenario: Interactive launch
- **WHEN** osq plan invokes the registered Codex adapter
- **THEN** the interactive process receives the existing ordered prompt without exec/JSON flags or executor effort overrides

#### Scenario: Interactive termination
- **WHEN** the interactive process exits nonzero, is terminated by a signal, or cannot spawn
- **THEN** the adapter returns a nonzero outcome that the planning command propagates

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts, src/core/manifest.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner, process execution, agent harnesses, and execution manifest construction.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher or harness execution
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/lock.ts`, and `src/core/manifest.ts` to watcher-and-harness
