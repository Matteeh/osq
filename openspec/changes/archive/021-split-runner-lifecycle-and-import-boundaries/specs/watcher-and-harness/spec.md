# Spec Delta: Watcher and Harness

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## ADDED Requirements

### Requirement: Runner lifecycle modularization
<!-- source: src/watcher/runner.ts, src/watcher/lock.ts, src/watcher/spawn.ts, src/watcher/heartbeat.ts, src/watcher/verify.ts, src/watcher/outcome.ts -->
The watcher runner SHALL partition lifecycle phases into discrete modules under 200 lines each (`lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, `outcome.ts`), with `runner.ts` orchestrating the sequence.

#### Scenario: Module line budget limit
- **WHEN** line counts are evaluated for `lock.ts`, `spawn.ts`, `heartbeat.ts`, `verify.ts`, `outcome.ts`, and `runner.ts`
- **THEN** each file contains fewer than 200 lines of code

#### Scenario: Lifecycle sequence orchestration
- **WHEN** `runTask` executes
- **THEN** runner coordinates lock acquisition, heartbeat observation, agent process execution, test gating, verification, and outcome recording across dedicated lifecycle modules

### Requirement: Architectural import graph boundaries
<!-- source: src/core/**, src/harness/**, src/watcher/**, tests/import-graph.test.ts -->
The codebase SHALL enforce strict directional import boundaries across packages, preventing backward or cross-tier dependency leaks.

#### Scenario: Core layer isolation
- **WHEN** import dependencies of `src/core/**` are analyzed
- **THEN** no module in `src/core` imports from any directory outside `src/core`

#### Scenario: Harness layer boundaries
- **WHEN** import dependencies of `src/harness/**` are analyzed
- **THEN** no module in `src/harness` imports from `src/watcher` or `src/cli`

#### Scenario: Watcher layer boundaries
- **WHEN** import dependencies of `src/watcher/**` are analyzed
- **THEN** no module in `src/watcher` imports from `src/cli`
