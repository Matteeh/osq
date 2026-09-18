# Spec Delta: Watcher and Harness

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## ADDED Requirements

### Requirement: Consolidated marker writing and pure state derivation
<!-- source: src/watcher/outcome.ts, src/core/lock.ts, src/core/state.ts, tests/runner-done-dead-events.test.ts -->
The engine SHALL centralize marker file emission in dedicated watcher outcome helpers, isolate lock reaping to detection, and evaluate change status purely against in-memory filesystem snapshots.

#### Scenario: Marker and event invariant parity
- **WHEN** a task terminates under any `RunTaskFailureReason` or reaches successful completion
- **THEN** matching marker content and lifecycle events are written through centralized outcome helpers

#### Scenario: Pure spec state derivation
- **WHEN** spec state is computed
- **THEN** `deriveSpecState` evaluates an in-memory change folder snapshot without performing direct asynchronous disk I/O

### Requirement: Source module line budget enforcement
<!-- source: tests/line-budget.test.ts -->
The test suite SHALL enforce a 250-line maximum on all source files under `src/`, permitting exceptions only for explicitly allow-listed legacy modules.

#### Scenario: Source file size within budget
- **WHEN** files under `src/` are inspected
- **THEN** all files except `report.ts`, `show.ts`, `opencode.ts`, and `agy.ts` contain 250 or fewer lines of code
