# Watcher and Harness

## Purpose

Drives reactive execution of approved tasks: manages exclusive locks, spawns coding agents across harness adapters, executes independent zero-trust verification gates, applies delta specs, and archives completed changes.

## Requirements

### Requirement: Code ownership
<!-- source: src/watcher/**, src/harness/**, src/core/lock.ts -->
The Watcher and Harness capability SHALL own the reactive watch loop, runner, process execution, and agent harnesses.

#### Scenario: Codebase ownership boundaries
- **WHEN** file ownership is resolved for watcher or harness execution
- **THEN** system maps `src/watcher/**`, `src/harness/**`, and `src/core/lock.ts` to `watcher-and-harness`

### Requirement: Capability rule prompt injection
<!-- source: src/harness/agy.ts, src/harness/opencode.ts, tests/harness-prompt-injection.test.ts -->
The harness runner SHALL extract rules from capability specifications written by the active change and inject them into the executor prompt.

#### Scenario: Prompt injection on change with capability writes
- **WHEN** an approved change writes capability deltas under `specs/<capability>/spec.md`
- **THEN** runner extracts capability requirements and injects them under a dedicated section within the prompt's `Rules:` block

#### Scenario: Fallback when no capability rules exist
- **WHEN** an approved change has no capability delta rules
- **THEN** runner provides standard operational rules without empty rule headers

### Requirement: Test modification gating
<!-- source: src/watcher/runner.ts, tests/runner-test-gating.test.ts -->
The runner SHALL detect modifications to existing test files following agent execution and gate completion on the task's `tests.modify` declaration.

#### Scenario: Test modification with tests.modify true
- **WHEN** agent modifies preexisting test files and task declared `tests.modify: true`
- **THEN** runner proceeds to independent zero-trust verification gate

#### Scenario: Test modification without tests.modify declaration
- **WHEN** agent modifies or deletes preexisting test files and task omitted `tests.modify: true`
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, emits a `dead` event, and halts without running verification

#### Scenario: Brand new test file creation
- **WHEN** agent creates a new test file without modifying preexisting test files
- **THEN** runner permits the addition without requiring `tests.modify: true`

### Requirement: Build identity metadata
<!-- source: src/watcher/build.ts, src/watcher/loop.ts, src/watcher/runner.ts -->
The watcher and runner SHALL identify the active osq build version and git commit or dist hash across lifecycle events and idle status.

#### Scenario: Task started lifecycle event metadata
- **WHEN** a task begins execution and emits a `started` lifecycle event
- **THEN** runner records the osq package version and git commit SHA or dist hash under event data

#### Scenario: Idle status line build prefix
- **WHEN** watcher formats the idle status line while waiting for approved specs
- **THEN** status output prefixes the line with `osq v<version> (<commit>)`

### Requirement: Stale build preflight detection
<!-- source: src/watcher/build.ts, src/watcher/loop.ts -->
The watcher SHALL verify that compiled output is not older than source files when started from a checkout.

#### Scenario: Stale build detected on checkout without allow-stale
- **WHEN** watcher starts from a checkout and newest file mtime under `src/` exceeds newest mtime under `dist/` without `--allow-stale`
- **THEN** watcher logs a single error line to stderr and exits non-zero

#### Scenario: Stale build bypassed with allow-stale
- **WHEN** watcher starts from a checkout with stale `dist/` and `--allow-stale` is supplied
- **THEN** watcher continues startup into the execution loop

### Requirement: Reactive dev mode execution
<!-- source: src/cli/watch.ts, src/watcher/dev.ts -->
The watcher in dev mode SHALL execute from source via tsx and restart the watch loop on source file changes.

#### Scenario: Dev mode execution through tsx
- **WHEN** watcher starts with `--dev`
- **THEN** execution runs through `tsx` directly from `src/`

#### Scenario: Source file modification during task execution
- **WHEN** a file under `src/` changes while a task is running in dev mode
- **THEN** watcher finishes the active task verification and outcome recording before restarting the loop

## Delta from Watcher stale build detection, build identity recording, and dev mode

This change introduces build identity metadata, stale build preflight detection, and reactive dev mode loop execution via capability delta specifications in `specs/cli-foundation/spec.md` and `specs/watcher-and-harness/spec.md`.
