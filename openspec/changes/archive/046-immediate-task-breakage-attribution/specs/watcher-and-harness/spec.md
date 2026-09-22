# Spec Delta: Watcher and Harness

## MODIFIED Requirements

### Requirement: Zero-trust verification gate and write-only checkbox projection
<!-- source: src/watcher/runner.ts, src/watcher/change-verify.ts, src/watcher/verify.ts, tests/runner-test-gating.test.ts -->
The system SHALL execute independent task verification before marking tasks
complete. When `gates.changeVerifyAfterTask` is enabled, a successful task
verify SHALL be followed by the proposal's change-level verify under
`verifyTimeoutSeconds` before completion. A task SHALL reach done only after
every enabled gate passes.

This incremental change gate intentionally requires each completed task to
leave the full change verifier green. Changes that would be red between coupled
tasks SHALL be represented as one coherent task.

#### Scenario: Successful independent verification
- **WHEN** agent creates a result file and every enabled task-boundary verification exits with code 0
- **THEN** system writes `.run/done/<n>` and updates `- [x] <n>` in `tasks.md` as a write-only projection

#### Scenario: Failed verification
- **WHEN** `task.verify` exits non-zero or times out
- **THEN** system writes `.run/dead/<n>.md` with `reason: verify_red`, does not run the incremental proposal verify, and halts spec execution

#### Scenario: Failed incremental change verification
- **WHEN** task verification passes but the enabled proposal verify exits non-zero or times out
- **THEN** system writes `.run/dead/<n>.md` with `reason: change_verify_red` before any done marker or checkbox update and halts spec execution

#### Scenario: Incremental change verification disabled
- **WHEN** `gates.changeVerifyAfterTask` is false and task verification passes
- **THEN** runner proceeds to completion without running the proposal verify at that task boundary

### Requirement: Dead letter recording and failure handling
<!-- source: src/watcher/runner.ts, src/watcher/outcome.ts, src/watcher/change-verify.ts, tests/runner-test-gating.test.ts -->
The system SHALL record failure markers and dead events for all terminal failure reasons.

#### Scenario: Dead marker creation
- **WHEN** task fails due to `verify_red`, `change_verify_red`, `spec_conflict`, `no_result`, `crashed`, `timeout`, or `already_running`
- **THEN** system writes `.run/dead/<n>.md` and appends `dead` event to `.run/events/<n>.jsonl`

#### Scenario: Change verification dead marker evidence
- **WHEN** incremental change-level verification fails or times out
- **THEN** the task dead marker records `change_verify_red`, command, numeric exit code, captured output, and timeout state when applicable

### Requirement: Test modification gating
<!-- source: src/watcher/runner.ts, src/watcher/verify.ts, src/core/scope.ts, tests/runner-test-gating.test.ts -->
The runner SHALL snapshot every preexisting file under `tests/**` before agent
execution and resolve the task's scope against that pre-spawn tree. A changed
or deleted preexisting test file SHALL be authorized only when the task
declares `tests.modify: true` and that resolved scope contains the file.

Every unauthorized diagnostic SHALL be sorted by project-relative POSIX path
and name the file's changed or deleted state plus the literal file scope entry
that would authorize it.

#### Scenario: Test modification with tests.modify true
- **WHEN** agent changes or deletes a preexisting test file, `tests.modify: true`, and pre-spawn scope resolution contains that file
- **THEN** runner permits that file and proceeds to independent zero-trust verification

#### Scenario: Test modification outside declared scope
- **WHEN** agent changes or deletes a preexisting test file that pre-spawn scope resolution does not contain
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, names the required literal scope entry, emits a `dead` event, and halts without running verification

#### Scenario: Test modification without tests.modify declaration
- **WHEN** agent modifies or deletes a preexisting test file and task omitted `tests.modify: true`
- **THEN** runner writes `.run/dead/<n>.md` with `reason: undeclared_test_change`, emits a `dead` event, and halts without running verification

#### Scenario: Brand new test file creation
- **WHEN** agent creates a new test file that was absent from the pre-spawn snapshot
- **THEN** runner permits the addition without requiring `tests.modify: true`

### Requirement: Emitted verify_ran event exit code and duration
<!-- source: src/core/verification.ts, src/harness/types.ts, src/watcher/verify.ts, src/watcher/change-verify.ts, src/watcher/runner.ts -->
The task, incremental change, scope-audit, and archive verification gates SHALL
execute commands through one core process implementation that returns command,
exit code, duration, output, and timeout state. Watcher callers SHALL emit
`verify_ran` events through the single watcher verification entrypoint. Core
verification SHALL NOT import watcher or harness modules.

#### Scenario: Verified task event fields
- **WHEN** task verification succeeds
- **THEN** runner emits a `verify_ran` event containing `command`, `exitCode: 0`, wall-clock `duration`, and captured output when present

#### Scenario: Failed task event fields
- **WHEN** task verification exits with non-zero code or times out
- **THEN** runner emits a `verify_ran` event containing `command`, non-zero `exitCode`, elapsed `duration`, captured output, and timeout state

#### Scenario: Incremental change verification attribution
- **WHEN** runner executes the proposal verify after a passing task verify
- **THEN** the same watcher verification entrypoint appends its `verify_ran` event to the established change-level target

#### Scenario: Single verification event emission path
- **WHEN** watcher verification or explicit scope recertification executes a verify command
- **THEN** both use the same timeout-bounded core process implementation without violating core import isolation
