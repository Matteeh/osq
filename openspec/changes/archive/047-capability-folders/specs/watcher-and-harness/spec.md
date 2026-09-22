# Spec Delta: Watcher and Harness

## MODIFIED Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/run/**, src/core/lifecycle/**, tests/retry*.test.ts, tests/reject.test.ts, tests/done-manual.test.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner,
process execution, deterministic task-scope resolution and hashing, shared
verification execution, agent harnesses, adapter registration, execution
manifest construction, and append-only execution lifecycle event contracts.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher, scope, verification, harness execution, or retry and rejection lifecycle events
- **THEN** system maps `src/watcher/**`, `src/harness/**`, `src/core/run/**`, `src/core/lifecycle/**`, `tests/retry*.test.ts`, `tests/reject.test.ts`, and `tests/done-manual.test.ts` to watcher-and-harness
