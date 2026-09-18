# Spec Delta: Watcher and Harness

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## ADDED Requirements

### Requirement: Typed event hygiene and single emission path
<!-- source: src/harness/types.ts, src/core/summary.ts, src/harness/opencode.ts, src/harness/agy.ts, src/watcher/spawn.ts -->
The harness and watcher SHALL record lifecycle and tool events using a typed discriminated union, with tool summaries relativized to the project root at write time, single code path emission per event type, and build metadata on task initiation.

#### Scenario: Task started event metadata
- **WHEN** a task execution starts
- **THEN** the single `started` event emitted by the runner includes `harness`, `model`, and `osqVersion` under event data

#### Scenario: Write-time tool summary relativization
- **WHEN** an agent executes a tool call targeting workspace files
- **THEN** harness relativizes absolute project paths in the tool summary relative to the project root before writing to `events.jsonl`

### Requirement: Golden event stream validation
<!-- source: tests/golden-events.test.ts, tests/fixtures/events/** -->
The test suite SHALL validate end-to-end task execution event streams against checked-in golden fixtures for both verified and dead task outcomes.

#### Scenario: Verified task golden events match
- **WHEN** runner executes a successful mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/verified.jsonl`

#### Scenario: Dead task golden events match
- **WHEN** runner executes a failing mock harness task end-to-end
- **THEN** the normalized emitted events match `tests/fixtures/events/dead.jsonl`
