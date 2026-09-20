# Spec Delta: Watcher and Harness

## ADDED Requirements

### Requirement: Exhaustive adapter registration and generic preflight
<!-- source: src/harness/index.ts, src/watcher/loop.ts, tests/harness-catalog.test.ts, tests/harness-generic-workflows.test.ts -->
The harness subsystem SHALL provide one adapter factory for every canonical catalog entry and no unlisted factory. Watcher startup SHALL invoke the selected adapter's optional preflight port before task execution without testing the adapter's name, and SHALL continue normally when the port is absent.

#### Scenario: Adapter with preflight
- **WHEN** watcher startup receives any registered adapter implementing preflight
- **THEN** it invokes preflight before the first execution cycle and propagates failure without spawning a task

#### Scenario: Adapter without preflight
- **WHEN** watcher startup receives a registered adapter without preflight
- **THEN** it enters the execution cycle without a harness-specific fallback

### Requirement: Shared selected-harness attribution
<!-- source: src/core/harness-catalog.ts, src/core/manifest.ts, src/cli/plan.ts, src/watcher/spawn.ts, tests/harness-generic-workflows.test.ts -->
Approval manifests, task-start events, planning briefs, and interactive planning arguments SHALL consume shared selected-harness resolution. Executor identity SHALL contain the selected harness, its effective model or `default`, and applicable effort or null. Planner selection SHALL remain independent when its harness differs from the executor.

#### Scenario: Consistent executor identity
- **WHEN** a registered harness executes an approved task
- **THEN** its process selection, approval manifest, and started event agree on harness and model attribution, and effort is recorded only when applicable

#### Scenario: Mixed executor and planner harnesses
- **WHEN** executor and planner select different registered harnesses
- **THEN** planning brief and invocation values come only from the planner selection while manifest execution fields and started events come only from the executor selection

#### Scenario: Native model selection
- **WHEN** the selected harness leaves model choice to its native default
- **THEN** metadata records `default`, the native invocation receives no invented model override, and no other harness's configured model is used

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts, src/core/manifest.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner, process execution, agent harnesses, adapter registration, and execution manifest construction.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher or harness execution
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/lock.ts`, and `src/core/manifest.ts` to watcher-and-harness
