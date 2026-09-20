---
title: Scalable harness capability catalog
depends_on: ["032"]
verify: pnpm verify
features:
  reads:
    - cli-foundation
    - watcher-and-harness
---
## Goal

Make first-party harness support scale without adding harness-name conditionals throughout configuration validation, diagnostics, planning, watcher startup, and attribution.

Introduce one immutable catalog for shared harness capabilities and resolution rules, paired with a compile-time exhaustive adapter factory map. Generic workflows consume the catalog or the existing adapter ports and do not identify individual harnesses.

## Verify

`pnpm verify`

Automated tests exercise configuration, doctor, approval manifests, watcher startup, started events, and planning through their real entry points using fake executables. They require no authentication, network access, real model, or TTY.

## Non-goals

- Dynamic third-party plugin loading or runtime harness registration.
- Changing the existing `HarnessAdapter` execution, preflight, or interactive-spawn ports.
- Unifying harness-specific configuration fields or command-line arguments.
- Changing configuration precedence or behavior established by 032.
- Adding another harness.
- Changing event, manifest, or report schemas.

## Contract

### Requirement: Canonical harness capability catalog

The system SHALL maintain one immutable catalog of supported harness names and their shared configuration capabilities, including executable resolution, execution identity, effort attribution, and planner-agent support. No independent supported-harness lists SHALL exist. The adapter factory map SHALL be statically exhaustive over the catalog's harness names, so adding or removing a catalog entry without a corresponding adapter factory fails type checking.

#### Scenario: Registered harness lookup
- **WHEN** executor or planner configuration names a registered harness using any supported casing
- **THEN** validation, adapter lookup, available-harness diagnostics, and shared metadata resolution identify the same catalog entry

#### Scenario: Catalog and adapter drift
- **WHEN** a catalog entry lacks an adapter factory or an adapter factory has no catalog entry
- **THEN** compilation or registry contract tests fail

### Requirement: Capability-driven planner validation

Planner validation SHALL derive supported harness names and harness-specific optional-setting support from the catalog while retaining the required non-empty planner model.

#### Scenario: Supported planner settings
- **WHEN** planner configuration supplies settings supported by its selected harness
- **THEN** validation returns normalized planner configuration without consulting another harness

#### Scenario: Unsupported planner settings
- **WHEN** planner configuration supplies a harness-specific setting that its selected harness does not support
- **THEN** validation fails with an error naming the harness and unsupported setting

### Requirement: Generic harness diagnostics and preflight

Doctor SHALL resolve and probe the selected executor through catalog metadata. Watcher startup SHALL invoke the selected adapter's optional preflight port without checking its name. Harnesses that require no external executable SHALL declare that capability explicitly and pass diagnostics without a process probe.

#### Scenario: Executable diagnostics
- **WHEN** doctor checks any registered external harness
- **THEN** it probes that harness's resolved executable using catalog-defined metadata and reports its version or an actionable failure

#### Scenario: Watcher preflight
- **WHEN** the selected adapter implements preflight
- **THEN** watcher startup invokes it before task execution regardless of adapter name

#### Scenario: Harness without preflight
- **WHEN** the selected adapter does not implement preflight
- **THEN** watcher startup continues without a harness-specific fallback branch

### Requirement: Selected-harness identity resolution

A shared resolver SHALL derive executor and planner identity only from the selected harness. It SHALL return the effective model or `default`, applicable effort or null, and supported planner agent without falling back to another harness's configuration. Approval manifests, task-start events, planning briefs, and interactive invocation SHALL consume this resolved identity.

#### Scenario: Executor attribution
- **WHEN** a task uses any registered harness
- **THEN** its manifest and started event agree on the selected harness and effective model, and effort is recorded only when applicable

#### Scenario: Independent planner attribution
- **WHEN** executor and planner use different harnesses
- **THEN** the planning brief and interactive invocation use only the planner selection while execution metadata uses only the executor selection

#### Scenario: Native model selection
- **WHEN** the selected harness delegates model choice to its native default
- **THEN** attribution records `default` and no model belonging to another harness is used

### Requirement: Harness-extension guardrails

Generic harness consumers SHALL contain no conditionals or fallback expressions naming individual first-party harnesses. Architecture tests SHALL enforce this boundary for configuration validation, doctor, watcher startup, task-start attribution, manifests, and planning.

#### Scenario: New first-party harness
- **WHEN** a future harness is added
- **THEN** shared workflow support requires its configuration type and defaults, one catalog entry, its adapter implementation, and the exhaustive factory entry, without editing generic workflow branches

#### Scenario: Harness-specific branch regression
- **WHEN** a generic consumer introduces a conditional naming agy, OpenCode, Codex, or a later registered harness
- **THEN** the architecture test fails

## Human steps

- Finish and archive 032 before executing 033; this change refactors the completed Codex integration together with the existing adapters.
- Review this change, then run `pnpm osq approve 033` yourself. Neither planner nor executor approves it.

## Delta

- `specs/cli-foundation/spec.md`: canonical catalog, configuration and planner validation, doctor resolution, and generic-consumer guardrails.
- `specs/watcher-and-harness/spec.md`: exhaustive adapter registration, generic watcher preflight, and consistent execution and planning attribution.
