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
