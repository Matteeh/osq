# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Codex configuration and resolution
<!-- source: src/core/config*.ts, src/index.ts, tests/codex/** -->
The configuration subsystem SHALL support harness codex and publicly exported CodexConfig with optional non-empty bin, model, and effort strings, preserving existing harness defaults. Codex binary resolution SHALL use explicit codex.bin, then CODEX_PATH, then codex. Executor model resolution SHALL use explicit codex.model, then OSQ_MODEL only for a Codex executor, then native Codex defaults. Effort SHALL use explicit codex.effort or native defaults.

#### Scenario: Explicit configuration wins
- **WHEN** explicit Codex settings and environment fallbacks both exist
- **THEN** osq uses explicit settings without borrowing another harness's model

#### Scenario: Native defaults
- **WHEN** Codex model and effort have no applicable configuration
- **THEN** osq omits their CLI overrides and does not invent a resolved model

### Requirement: Codex setup and diagnostics
<!-- source: src/cli/setup.ts, src/core/doctor.ts, src/core/config*.ts, src/harness/codex*.ts, tests/codex/** -->
The system SHALL support Codex setup through the shared managed AGENTS procedure without generating harness-specific configuration or credentials. Doctor SHALL probe the configured Codex execution binary with --version, resolving it identically to the adapter. Optional harnessPreflightSeconds and harnessKillGracePeriodMs timeout fields SHALL preserve existing timeout-object compatibility and use centrally configured defaults.

#### Scenario: Idempotent mixed-harness setup
- **WHEN** Codex is the executor, planner, or both and setup runs repeatedly
- **THEN** shared instructions and foreign managed blocks coexist, consumer Codex files remain intact, no Codex files are created, and the other selected adapter is also set up where applicable

#### Scenario: Failed binary probe
- **WHEN** the resolved Codex executable is missing, returns nonzero, or exceeds its configured preflight deadline
- **THEN** doctor reports an actionable failing harness check and exits unsuccessfully

### Requirement: Codex planning selection
<!-- source: src/core/config*.ts, src/cli/plan.ts, tests/codex/** -->
Planner configuration SHALL accept codex with the existing required non-empty planner.model and SHALL reject planner.agent for Codex. The planning command SHALL use the selected planner harness's model consistently in brief metadata and process arguments, including when falling back to a Codex executor. Explicit Codex planners SHALL use native effort defaults rather than executor-specific effort.

#### Scenario: Independent planner model
- **WHEN** executor and planner use different harnesses and the planner is Codex
- **THEN** the brief and invocation use planner.model and do not inherit the executor's model, OSQ_MODEL fallback, or effort

#### Scenario: Implicit Codex planner
- **WHEN** no planner block exists and the execution harness is Codex
- **THEN** planning uses the Codex executor's selected model, or writes default in brief metadata and omits the CLI model flag when native selection is used

#### Scenario: Unsupported planner agent
- **WHEN** planner.harness is codex and planner.agent is supplied
- **THEN** configuration fails with a clear unsupported-setting error rather than silently ignoring the agent

#### Scenario: Existing-change and print paths
- **WHEN** planning reopens an existing change with a brief or uses the existing print option
- **THEN** the existing change is reused for a fresh file-seeded session, while print mode emits the ordered opening prompt without launching Codex

### Requirement: Codex consumer guidance
<!-- source: README.md, .env.example, src/core/init.ts, tests/codex-guidance.test.ts -->
The README and scaffolded environment example SHALL describe Codex selection, independent planning configuration, optional model/effort, precedence, setup and authentication prerequisites, permissions, diagnostics, fresh sessions, watcher verification, and observed-only metrics. Examples SHALL preserve the current default harness and contain no credentials or hard-coded recommended model.

#### Scenario: Scaffold preservation
- **WHEN** a clean project is scaffolded and later scaffolded again after its environment example is edited
- **THEN** the original generated example includes commented Codex guidance and the repeat run preserves consumer edits

#### Scenario: Honest support boundaries
- **WHEN** a consumer reads the Codex guidance
- **THEN** it distinguishes task scope from sandbox permissions, leaves unreported cost unestimated, and describes optional live validation without claiming an untested minimum CLI version

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: osq.config.ts, src/cli/**, src/core/config*.ts, src/core/doctor.ts, src/core/init.ts, src/core/logger.ts, src/index.ts, templates/**, README.md, .env.example -->
The CLI Foundation capability SHALL own CLI entrypoints, configuration and resolution helpers, doctor diagnostics, logger, initialization, public configuration exports, templates, and consumer guidance.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI or configuration files
- **THEN** system maps `osq.config.ts`, `src/cli/**`, `src/core/config*.ts`, `src/core/doctor.ts`, `src/core/init.ts`, `src/core/logger.ts`, `src/index.ts`, `templates/**`, `README.md`, and `.env.example` to cli-foundation
