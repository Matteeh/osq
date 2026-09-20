# Spec Delta: CLI Foundation

## ADDED Requirements

### Requirement: Canonical harness capability catalog
<!-- source: src/core/harness-catalog.ts, src/core/config*.ts, src/harness/index.ts, src/index.ts, tests/harness-catalog.test.ts -->
The configuration subsystem SHALL maintain one immutable catalog of supported harness names and shared capabilities for executable resolution, execution identity, effort attribution, and planner-agent support. Supported-name validation, available-name diagnostics, and shared harness resolution SHALL derive from this catalog without independent harness-name sets. Adapter factories SHALL be statically exhaustive over the catalog-derived harness name type.

#### Scenario: Consistent registered harness lookup
- **WHEN** a registered executor or planner harness is resolved with supported casing
- **THEN** configuration validation, adapter lookup, available names, and shared metadata identify the same catalog entry

#### Scenario: Catalog and adapter factory parity
- **WHEN** a catalog entry lacks an adapter factory or a factory lacks a catalog entry
- **THEN** type checking or registry contract tests fail

### Requirement: Capability-driven planner validation
<!-- source: src/core/harness-catalog.ts, src/core/config*.ts, src/cli/plan.ts, tests/config-planner-catalog.test.ts -->
Planner validation SHALL derive supported harness names and optional-setting support from the canonical harness catalog while requiring a non-empty planner model. Planner selection SHALL use explicit planner configuration when present and otherwise the selected executor's catalog entry, without borrowing model, effort, or agent values from another harness.

#### Scenario: Supported planner configuration
- **WHEN** planner configuration supplies only settings supported by its selected catalog entry
- **THEN** validation returns normalized planner configuration and planning uses that harness's model and agent selection

#### Scenario: Unsupported planner setting
- **WHEN** planner configuration supplies an optional setting unsupported by its selected harness
- **THEN** validation fails with an error naming the harness and unsupported setting

#### Scenario: Implicit planner selection
- **WHEN** no planner block is configured
- **THEN** planning uses the selected executor's planner capabilities, records `default` for native model attribution when applicable, and passes no invented model override

### Requirement: Catalog-driven harness diagnostics
<!-- source: src/core/doctor.ts, src/core/harness-catalog.ts, tests/harness-generic-workflows.test.ts -->
Repository health diagnostics SHALL resolve the selected executor's external executable through the canonical harness catalog and probe it with the configured deadline. A catalogued harness that declares no external executable SHALL pass the harness diagnostic without spawning a process.

#### Scenario: External harness diagnostic
- **WHEN** doctor checks a registered harness with an external executable
- **THEN** it probes the catalog-resolved command and reports its version or an actionable missing, nonzero, or timeout failure

#### Scenario: No-binary harness diagnostic
- **WHEN** doctor checks a registered harness declaring no external executable
- **THEN** the harness check succeeds without a process probe

### Requirement: Generic harness consumer guardrails
<!-- source: tests/harness-architecture.test.ts -->
Generic configuration, diagnostics, planning, manifest, and watcher consumers SHALL NOT select behavior through comparisons or fallback expressions naming individual first-party harnesses. Architecture validation SHALL derive forbidden generic-consumer name branches from the canonical catalog rather than a separately maintained harness list.

#### Scenario: Harness-specific generic branch
- **WHEN** a generic consumer introduces a semantic branch or cross-harness fallback naming a catalogued harness
- **THEN** architecture validation fails

#### Scenario: Future first-party harness
- **WHEN** a future first-party harness is added
- **THEN** generic consumers require no harness-specific branch changes

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: osq.config.ts, src/cli/**, src/core/config*.ts, src/core/doctor.ts, src/core/harness-catalog.ts, src/core/init.ts, src/core/logger.ts, src/index.ts, templates/**, README.md, .env.example -->
The CLI Foundation capability SHALL own CLI entrypoints, configuration and shared harness capability resolution, doctor diagnostics, logger, initialization, public configuration exports, templates, and consumer guidance.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for CLI or configuration files
- **THEN** system maps `osq.config.ts`, `src/cli/**`, `src/core/config*.ts`, `src/core/doctor.ts`, `src/core/harness-catalog.ts`, `src/core/init.ts`, `src/core/logger.ts`, `src/index.ts`, `templates/**`, `README.md`, and `.env.example` to cli-foundation
