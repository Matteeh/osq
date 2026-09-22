# Spec Delta: Watcher and Harness

## MODIFIED Requirements

### Requirement: Harness adapters and process execution
<!-- source: features/watcher-and-harness.md # Harness Adapters, tests/harness.test.ts, tests/harness-process.test.ts, tests/opencode-spawn.test.ts, tests/agy-stream-events.test.ts -->
The system SHALL decouple agent execution via `HarnessAdapter` implementations.

#### Scenario: Adapter process spawning
- **WHEN** watcher executes a task
- **THEN** configured adapter spawns agent process, enforces execution timeouts, and routes event stream to normalized harness events

#### Scenario: Kill-grace timeout coverage
- **WHEN** the process timeout test runs a real child that handles `SIGTERM` without terminating
- **THEN** the test asserts that execution timed out and terminated with `SIGKILL`, without asserting wall-clock time
