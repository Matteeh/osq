---
title: Codex CLI harness support
depends_on: ["031"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - watcher-and-harness
    - metrics-and-reporting
---
## Goal

Make Codex CLI a first-class osq harness for approved task execution and interactive planning, including setup, diagnostics, event translation, and accurate model attribution.

## Verify

`pnpm verify`

Automated tests exercise real osq entry points with a deterministic fake Codex executable in disposable copies of `fixture/`. They require no authentication, network access, real model, or TTY. Live validation is a separate human step.

## Non-goals

- Codex SDK/App Server, new runtime dependencies, or new adapter interface methods.
- Installing Codex, authentication management, or changing the consumer's selected harness.
- Codex conversation resume, automatic retries, autonomous planning, concurrency, or worktrees.
- Hard task-scope confinement, container isolation, or claiming prompt restrictions are OS permissions.
- Cost estimation, report schema changes, or unrelated adapter/engine refactoring.

## Contract

### Requirement: Codex configuration and selection

The system SHALL register `codex` and publicly export `CodexConfig` with optional non-empty string fields `bin`, `model`, and `effort`. It SHALL preserve existing harness defaults and configuration compatibility.

#### Scenario: Executor configuration precedence
- **WHEN** Codex execution settings are resolved
- **THEN** binary resolution uses explicit `codex.bin`, then `CODEX_PATH`, then `codex`; model resolution uses explicit `codex.model`, then `OSQ_MODEL` only for a Codex executor, then the native default; effort uses explicit `codex.effort` or the native default

#### Scenario: Independent planner configuration
- **WHEN** `planner.harness` is `codex`
- **THEN** validation accepts Codex, retains the required non-empty `planner.model`, and rejects `planner.agent` with a clear unsupported-setting error

### Requirement: Setup and binary diagnostics

Codex adapter setup SHALL require no harness-specific files. Shared setup SHALL maintain the managed AGENTS block and preserve consumer content. Doctor and watcher preflight SHALL probe the same configured executable with `--version` and fail clearly before task execution on missing, nonzero, or timed-out probes.

#### Scenario: Repeated or mixed-harness setup
- **WHEN** Codex is configured as executor, planner, or both and setup runs repeatedly
- **THEN** setup preserves foreign managed blocks and existing Codex configuration/credentials, creates no Codex files, and still invokes the other selected adapter's setup where applicable

#### Scenario: Configured timeouts
- **WHEN** Codex preflight or execution is bounded
- **THEN** preflight and termination grace use backwards-compatible optional `timeouts.harnessPreflightSeconds` and `timeouts.harnessKillGracePeriodMs` with defaults centralized in DEFAULT_CONFIG using the existing probe/grace values; task execution uses `timeouts.taskTimeoutSeconds`

### Requirement: Fresh task execution and permissions

The adapter SHALL use the existing process helper to start a fresh noninteractive Codex process in the project root, using literal argv, JSONL stdout, workspace-write sandboxing, approval policy never, disabled web search, and disabled workspace shell network access. It SHALL reuse native authentication/configuration loading without modifying it or bypassing enforced policies.

#### Scenario: Complete task context
- **WHEN** an approved task is spawned
- **THEN** its prompt names the task, parent proposal, relevant delta and living capability paths, prior result when present, scope, entry files, verification command, and result destination, and includes injected capability rules and the one-attempt executor procedure

#### Scenario: Invocation controls
- **WHEN** Codex is launched for execution
- **THEN** the invocation is equivalent to `codex --ask-for-approval never exec --json --sandbox workspace-write` with `web_search="disabled"` and `sandbox_workspace_write.network_access=false` config overrides, optional model and model_reasoning_effort overrides, and the prompt as one literal argument, without shell interpolation, full-auto, permission bypass flags, or session resume

### Requirement: Observations and watcher authority

The adapter SHALL translate Codex observations to existing osq events while the watcher retains lifecycle, marker, result synthesis, checkbox, and verification authority.

#### Scenario: Completed observations
- **WHEN** completed assistant messages, commands/MCP calls, successful file changes, and turn usage arrive
- **THEN** the adapter emits text, tool, file_changed, and tokens observations respectively, uses project-relative paths, and emits only one representation of each file change

#### Scenario: Usage accounting
- **WHEN** turn.completed includes usage
- **THEN** input_tokens maps to promptTokens, output_tokens to candidateTokens, cached_input_tokens to cachedTokens, and reported reasoning_output_tokens to reasoningTokens; total is input plus output without adding subsets again; absent optional counters and cost remain absent

#### Scenario: Stream boundaries
- **WHEN** records are chunked, malformed, unknown, or lack a final newline
- **THEN** valid observations are serialized in order and flushed before returning, malformed/unknown records do not abort parsing, and item.started/item.updated do not duplicate item.completed observations

#### Scenario: Terminal failure
- **WHEN** the process fails, times out, or reports turn.failed even with exit zero
- **THEN** the adapter returns failure diagnostics and the watcher records crashed or timeout; a recoverable error followed by a successful turn is not alone terminal

#### Scenario: Result and verification gates
- **WHEN** the process succeeds
- **THEN** the watcher preserves its result or synthesizes one from the last completed non-empty assistant message, records no_result if neither exists, records verify_red on failed independent verification, and writes done only after its own verification succeeds

### Requirement: Consistent attribution

Approval manifests, task-start events, and planner briefs SHALL use their selected harness's model without borrowing an agy/OpenCode model for Codex. The execution manifest SHALL record configured Codex effort or null. Unknown native model selection SHALL be represented as `default`, not a guessed model. Existing planner manifest semantics remain explicit planner.model or null.

#### Scenario: Mixed harnesses
- **WHEN** executor and planner use different harnesses
- **THEN** execution argv and metadata follow executor configuration while planning argv and briefs follow planner configuration; no executor model or effort leaks into an explicitly configured Codex planner

### Requirement: Interactive planning

The existing spawnInteractive port SHALL launch the Codex terminal UI with inherited stdio, the project root, existing opening prompt, selected planner model, workspace-write sandboxing, and on-request approvals. Interactive planning uses native effort defaults rather than executor-specific effort.

#### Scenario: Plan entry points
- **WHEN** osq plan selects Codex explicitly or falls back to a Codex executor
- **THEN** it launches without exec/JSON flags, preserves ordered prompt sections and brief handling, selects the same model for the brief and process, and propagates nonzero exits, signals, and spawn failures

#### Scenario: Existing change and print mode
- **WHEN** planning opens an existing change or uses the existing print option
- **THEN** existing-change planning starts a fresh Codex session seeded from files without recreating the change, while print mode emits the prompt without launching Codex

### Requirement: Consumer guidance

README and generated environment examples SHALL describe selection, independent planner configuration, binary/model precedence, optional effort, setup, authentication prerequisites, permissions, diagnostics, and observed-only cost reporting. Examples SHALL retain the current default harness and contain no credentials or hard-coded recommended model.

#### Scenario: Consumer onboarding
- **WHEN** a consumer follows the Codex instructions or initializes a project
- **THEN** they can select Codex with documented configuration and understand which setup/authentication steps are human-owned and which guarantees the watcher provides

## Delivery

The reviewed setup/execution/planning slices share adapter registration and configuration. They are merged into one integration task so later work cannot rewrite an earlier completed scope and trip scope-regression checks. A disjoint documentation task follows. This follows PLANNER.md's instruction to widen or merge tasks when complete wiring crosses scope.

The implementation may use small Codex modules and configuration helpers within scope to satisfy line budgets. It reuses getHarnessAdapter, spawnWithTimeout, EventStreamParser, appendHarnessEvent, resolveCapabilityRules, capabilityRuleLines, relativizeToolSummary, loadConfig, defineConfig, buildManifest, planCommand, and existing watcher outcomes.

## Human steps

- Finish and archive dependency 031 through the normal approval/watcher flow before executing 032. Its implementation being present does not satisfy the dependency gate.
- Review this change, then run `pnpm osq approve 032` yourself. Neither planner nor executor approves it.
- Before live use, install/authenticate Codex in the same host environment as osq, complete any native sandbox setup, and choose account-available models if explicit selection is wanted.
- After implementation, optionally run one harmless approved fixture task and one interactive planning session with real Codex. Confirm verification, results/events, attribution, and exit behavior. Record the tested CLI version; offline tests do not establish a minimum supported release.

## Delta

- `specs/cli-foundation/spec.md`: configuration, setup, diagnostics, planning selection, and consumer guidance.
- `specs/watcher-and-harness/spec.md`: execution, observation translation, interactive spawning, and attribution.

## Sources

Official documentation checked during planning on 2026-09-20. The local WSL Codex binary was not available for live validation.

- [Noninteractive mode](https://learn.chatgpt.com/docs/non-interactive-mode): exec, JSONL events, usage, authentication reuse, and sandbox selection.
- [CLI reference](https://learn.chatgpt.com/docs/developer-commands?surface=cli): approval/model/cwd flags and interactive invocation.
- [Configuration](https://learn.chatgpt.com/docs/config-file/config-basic): precedence, reasoning effort, and web search.
