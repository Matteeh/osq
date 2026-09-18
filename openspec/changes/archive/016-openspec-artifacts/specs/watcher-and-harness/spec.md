# Spec Delta: Watcher and Harness

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## ADDED Requirements

### Requirement: Exclusive locking and stale lock reaping
<!-- source: features/watcher-and-harness.md # Exclusive Locking & Stale Lock Reaping, tests/lock.test.ts, tests/runner-already-running.test.ts -->
The system SHALL manage atomic task locks and reap stale locks.

#### Scenario: Atomic lock acquisition
- **WHEN** runner initiates task `<n>`
- **THEN** system acquires `.run/running/<n>.pid` atomically and rejects execution if lock already exists

#### Scenario: Stale lock reaping
- **WHEN** active lock has terminated PID or age exceeds `staleLockSeconds`
- **THEN** watcher reaps the lock to `.run/dead/<n>.md` with reason `crashed` or `timeout`

### Requirement: Zero-trust verification gate and write-only checkbox projection
<!-- source: features/watcher-and-harness.md # Task Execution & Verification Gate, tests/runner.test.ts -->
The system SHALL execute independent task verification before marking tasks complete.

#### Scenario: Successful independent verification
- **WHEN** agent creates result file and `task.verify` exits with code 0
- **THEN** system writes `.run/done/<n>` and updates `- [x] <n>` in `tasks.md` as a write-only projection

#### Scenario: Failed verification
- **WHEN** `task.verify` exits non-zero or times out
- **THEN** system writes `.run/dead/<n>.md` with `reason: verify_red` and halts spec execution

### Requirement: Dead letter recording and failure handling
<!-- source: features/watcher-and-harness.md # Failure Reasons (Dead Letter Queue), tests/runner-done-dead-events.test.ts -->
The system SHALL record failure markers and dead events for all terminal failure reasons.

#### Scenario: Dead marker creation
- **WHEN** task fails due to `verify_red`, `spec_conflict`, `no_result`, `crashed`, `timeout`, or `already_running`
- **THEN** system writes `.run/dead/<n>.md` and appends `dead` event to `.run/events/<n>.jsonl`

### Requirement: Harness adapters and process execution
<!-- source: features/watcher-and-harness.md # Harness Adapters, tests/harness.test.ts, tests/opencode-spawn.test.ts, tests/agy-stream-events.test.ts -->
The system SHALL decouple agent execution via `HarnessAdapter` implementations.

#### Scenario: Adapter process spawning
- **WHEN** watcher executes a task
- **THEN** configured adapter spawns agent process, enforces execution timeouts, and routes event stream to normalized harness events

### Requirement: Authoritative lifecycle events and result synthesis
<!-- source: features/watcher-and-harness.md # Delta from Observability fixes, tests/runner-lifecycle-pid.test.ts, tests/runner-synthesized-result.test.ts -->
The system SHALL maintain authoritative lifecycle events and synthesize missing result files.

#### Scenario: Result file synthesis
- **WHEN** agent process exits successfully without authoring `.run/results/<n>.md`
- **THEN** runner extracts final text event and writes synthesized result file with `synthesized: true` frontmatter

### Requirement: Live terminal status row and curated logging
<!-- source: features/watcher-and-harness.md # Terminal UX & Observability, tests/logger-status.test.ts, tests/runner-terminal-status.test.ts, tests/runner-outcome-logging.test.ts -->
The system SHALL maintain an interactive status row and emit curated permanent log lines.

#### Scenario: Task outcome line logging
- **WHEN** task completes or dies
- **THEN** logger emits exactly one outcome line via `formatTaskOutcomeLine` at info level

### Requirement: Deterministic delta specification application
<!-- source: features/watcher-and-harness.md # Archiving & Delta Application, tests/archiver.test.ts -->
The system SHALL apply delta specifications into base capability specs upon change archival.

#### Scenario: Merging deltas into base specs
- **WHEN** all tasks in an approved spec are done
- **THEN** system applies `RENAMED`, `REMOVED`, `MODIFIED`, and `ADDED` blocks into `openspec/specs/<capability>/spec.md` deterministically and moves folder to archive

### Requirement: Reactive watcher loop and signal handling
<!-- source: features/watcher-and-harness.md # Commands, tests/watcher.test.ts, tests/watcher-loop-logging.test.ts -->
The system SHALL watch specifications reactively and respond cleanly to termination signals.

#### Scenario: SIGINT interruption handling
- **WHEN** SIGINT is received during task execution
- **THEN** watcher clears status line, restores cursor, awaits active task exit, and terminates immediately on second SIGINT
